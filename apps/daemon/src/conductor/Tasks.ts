import { randomUUID } from "node:crypto"
import {
  ComponentId,
  Message,
  MessageId,
  type ModelRef,
  RunId,
  TaskId,
  type TopicId,
} from "@domo/domain"
import {
  Clock,
  Context,
  DateTime,
  Effect,
  FiberMap,
  FileSystem,
  Layer,
  Option,
  Ref,
  Schema,
  Semaphore,
} from "effect"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { GoalStore } from "../goals/GoalStore.ts"
import { Memory } from "../memory/Memory.ts"
import { Providers } from "../providers/Providers.ts"
import { folderContext, folderPath, readNotes } from "../topics/folders.ts"
import { makeSystemPrompt, mcpFor, nameOf } from "./prompt.ts"
import { makeTurn } from "./turn.ts"

/** At most this many background tasks run at once; more wait their turn. */
const MAX_PARALLEL = 3

export class TaskNotStarted extends Schema.TaggedError<TaskNotStarted>()("TaskNotStarted", {
  message: Schema.String,
}) {}

export interface StartTask {
  /** The run that asked for it; the task's reply goes into the same topic. */
  readonly parentRunId?: RunId
  /** Or the topic itself, for work nothing is running for (a scheduled follow-up). */
  readonly topicId?: TopicId
  readonly title: string
  readonly instructions: string
  readonly model?: ModelRef
  readonly cwd?: string
}

export interface RunningTask {
  readonly taskId: TaskId
  readonly title: string
  readonly messageId: MessageId
  readonly startedMs: number
}

const taskPrompt = (title: string, instructions: string) =>
  `Background task: ${title}\n\n${instructions}\n\nWork through it fully. When you're done, write the ` +
  "result for the user: lead with the outcome in one or two sentences, then only the details they need."

/**
 * Long work that runs on its own while the chat stays free. A task writes into
 * its own reply (shown as "running" in the needs-you marker), can ask the user
 * and render components like any run, and posts its result when done.
 */
export class Tasks extends Context.Service<
  Tasks,
  {
    start(input: StartTask): Effect.Effect<RunningTask, TaskNotStarted>
    readonly running: Effect.Effect<ReadonlyArray<RunningTask>>
    cancel(taskId: TaskId): Effect.Effect<boolean>
    /** Cancels the task writing this reply, if any. */
    stopReply(messageId: MessageId): Effect.Effect<boolean>
  }
>()("domo/conductor/Tasks") {
  static readonly layer = Layer.effect(
    Tasks,
    Effect.gen(function* () {
      const store = yield* ChatStore
      const bus = yield* ChatBus
      const providers = yield* Providers
      const config = yield* DomoConfig
      const fs = yield* FileSystem.FileSystem
      const turn = makeTurn({
        store,
        bus,
        providers,
        mcp: mcpFor(config),
        systemPrompt: makeSystemPrompt(config, fs, yield* GoalStore, yield* Memory),
        nameOf,
      })
      const fibers = yield* FiberMap.make<TaskId>()
      const slots = yield* Semaphore.make(MAX_PARALLEL)
      const running = yield* Ref.make<ReadonlyMap<TaskId, RunningTask>>(new Map())

      /** A stopped or crashed task still ends its reply, so nothing is left "running" forever. */
      const stopReply = Effect.fnUntraced(function* (messageId: MessageId, text: string) {
        const latest = yield* store.getMessage(messageId)
        if (Option.isNone(latest) || latest.value.status !== "streaming") return
        const { work, ...rest } = latest.value
        const stopped = new Message({
          ...rest,
          text: latest.value.text.length > 0 ? latest.value.text : text,
          status: "failed",
          ...(work === undefined ? {} : { work: { ...work, status: "failed" as const } }),
        })
        yield* store.updateMessage(stopped)
        yield* bus.publish({ _tag: "AgentFinished", message: stopped })
      })

      const start = Effect.fn("Tasks.start")(function* (input: StartTask) {
        const parent =
          input.parentRunId === undefined ? Option.none() : yield* bus.lookupRun(input.parentRunId)
        const topicId = input.topicId ?? Option.getOrUndefined(parent)?.topicId
        if (topicId === undefined) {
          return yield* new TaskNotStarted({
            message: "Start tasks from inside a conversation turn.",
          })
        }
        const topic = yield* store.getTopic(topicId)
        if (Option.isNone(topic))
          return yield* new TaskNotStarted({ message: "That topic no longer exists." })
        const model = input.model ?? topic.value.model
        const cwd = input.cwd ?? topic.value.project
        // Without a project, a task works in its topic's folder, so what it writes lands there.
        const folder =
          topic.value.folder === undefined ? undefined : folderPath(config.home, topic.value.folder)
        const runCwd = cwd ?? folder
        const context =
          topic.value.folder === undefined || folder === undefined
            ? undefined
            : folderContext(
                folder,
                yield* readNotes(fs, config.home, topic.value.folder),
                cwd === undefined,
              )

        const taskId = TaskId.make(randomUUID())
        const message = new Message({
          id: MessageId.make(randomUUID()),
          topicId: topic.value.id,
          role: "agent",
          status: "streaming",
          text: "",
          model: model.key,
          createdAt: yield* DateTime.now,
          work: {
            _tag: "WorkReceipt",
            id: ComponentId.make(randomUUID()),
            runId: RunId.make(taskId),
            status: "running",
            summary: input.title,
            models: [model.key],
            ...(cwd === undefined ? {} : { project: cwd }),
          },
        })
        yield* store.insertMessage(message)
        yield* bus.publish({ _tag: "MessageAdded", message })

        const task: RunningTask = {
          taskId,
          title: input.title,
          messageId: message.id,
          startedMs: yield* Clock.currentTimeMillis,
        }
        yield* Ref.update(running, (m) => new Map(m).set(taskId, task))

        const work = slots
          .withPermits(1)(
            turn({
              message,
              model,
              prompt: taskPrompt(input.title, input.instructions),
              receiptFallback: `Finished: ${input.title}`,
              ...(runCwd === undefined ? {} : { cwd: runCwd }),
              ...(cwd === undefined ? {} : { project: cwd }),
              ...(context === undefined ? {} : { context }),
            }),
          )
          .pipe(
            Effect.onInterrupt(() => stopReply(message.id, "Stopped before it finished.")),
            Effect.catchCause((cause) =>
              Effect.logWarning("background task failed", cause).pipe(
                Effect.andThen(stopReply(message.id, "This task failed before it could finish.")),
              ),
            ),
            Effect.ensuring(
              Ref.update(running, (m) => {
                const next = new Map(m)
                next.delete(taskId)
                return next
              }),
            ),
          )
        yield* FiberMap.run(fibers, taskId, work)
        return task
      })

      const cancel = Effect.fn("Tasks.cancel")(function* (taskId: TaskId) {
        const known = (yield* Ref.get(running)).has(taskId)
        if (known) yield* FiberMap.remove(fibers, taskId)
        return known
      })

      const stopReplyOf = Effect.fn("Tasks.stopReply")(function* (messageId: MessageId) {
        const task = [...(yield* Ref.get(running)).values()].find((t) => t.messageId === messageId)
        return task === undefined ? false : yield* cancel(task.taskId)
      })

      return Tasks.of({
        start,
        running: Ref.get(running).pipe(Effect.map((m) => [...m.values()])),
        cancel,
        stopReply: stopReplyOf,
      })
    }),
  )
}
