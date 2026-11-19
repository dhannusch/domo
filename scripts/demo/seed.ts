// Seeds a fresh Domo home with the fictional demo conversation: `node scripts/demo/seed.ts <home>`.
import { randomUUID } from "node:crypto"
import {
  ComponentId,
  DEFAULT_MAIN_MODEL,
  Message,
  MessageId,
  RunId,
  Topic,
  TopicId,
} from "@domo/domain"
import { NodeServices } from "@effect/platform-node"
import { DateTime, Effect, Layer } from "effect"
import { ChatStore } from "../../apps/daemon/src/chat/ChatStore.ts"
import { DomoConfig } from "../../apps/daemon/src/config/DomoConfig.ts"
import { DatabaseLive } from "../../apps/daemon/src/store/Database.ts"
import { DEMO } from "./conversation.ts"

const home = process.argv[2]
if (home === undefined) throw new Error("Usage: node scripts/demo/seed.ts <home>")

const seed = Effect.gen(function* () {
  const store = yield* ChatStore
  const start = DateTime.toEpochMillis(yield* DateTime.now) - DEMO.length * 4 * 60_000
  const at = (minutes: number) => DateTime.makeUnsafe(start + minutes * 60_000)
  const topic = new Topic({
    id: TopicId.make("demo-kitchen"),
    title: "Kitchen remodel",
    status: "live",
    stakes: "low",
    summary: "Chose Hale & Co. for the kitchen, starting Dec 2.",
    sourceMessageIds: [],
    folded: false,
    model: DEFAULT_MAIN_MODEL,
    lastActivityAt: at(DEMO.length * 4),
  })
  yield* store.upsertTopic(topic)
  for (const [i, turn] of DEMO.entries()) {
    yield* store.insertMessage(
      new Message({
        id: MessageId.make(`demo-u${i}`),
        topicId: topic.id,
        role: "user",
        status: "done",
        text: turn.user,
        createdAt: at(i * 4),
      }),
    )
    yield* store.insertMessage(
      new Message({
        id: MessageId.make(`demo-a${i}`),
        topicId: topic.id,
        role: "agent",
        status: "done",
        text: turn.agent,
        model: turn.model,
        createdAt: at(i * 4 + 1),
        ...(turn.component === undefined ? {} : { component: turn.component }),
        ...(turn.work === undefined
          ? {}
          : {
              work: {
                _tag: "WorkReceipt" as const,
                id: ComponentId.make(`demo-work-${i}`),
                runId: RunId.make(randomUUID()),
                ...turn.work,
              },
            }),
      }),
    )
  }
})

await Effect.runPromise(
  seed.pipe(
    Effect.provide(
      ChatStore.layer.pipe(
        Layer.provideMerge(DatabaseLive),
        Layer.provide(DomoConfig.layerFrom({ home, port: 0 })),
        Layer.provide(NodeServices.layer),
      ),
    ),
  ),
)
