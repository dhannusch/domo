import { randomUUID } from "node:crypto"
import { Topic, TopicId } from "@domo/domain"
import { DateTime, Effect, type FileSystem, Option } from "effect"
import type { ActiveRun, ChatBus } from "../chat/ChatBus.ts"
import type { ChatStore } from "../chat/ChatStore.ts"
import { ensureFolder, folderName, folderPath, freeFolderName } from "./folders.ts"

interface Deps {
  readonly store: ChatStore["Service"]
  readonly bus: ChatBus["Service"]
  readonly fs: FileSystem.FileSystem
  readonly home: string
}

/**
 * The agent's own say over topics, for when the user asks for one: start a new topic from this
 * exchange, or rename the one it's in. Either way the exchange skips the Filer, which would
 * otherwise second-guess it.
 */
export const makePlacement = ({ store, bus, fs, home }: Deps) => {
  /** The user message this run answers: the last one before the reply in its topic. */
  const exchangeOf = Effect.fnUntraced(function* (run: ActiveRun) {
    const messages = yield* store.topicMessages(run.topicId, 20)
    const at = messages.findIndex((m) => m.id === run.messageId)
    const user = messages.slice(0, at < 0 ? messages.length : at).findLast((m) => m.role === "user")
    return user === undefined ? [run.messageId] : [user.id, run.messageId]
  })

  const startTopic = Effect.fn("Placement.startTopic")(function* (run: ActiveRun, title: string) {
    const current = yield* store.getTopic(run.topicId)
    if (Option.isNone(current)) return "That conversation no longer exists."
    const ids = yield* exchangeOf(run)
    // Strictly after the old topic's last activity, so the next message lands in the new one.
    const now = yield* DateTime.now
    const after = DateTime.add(current.value.lastActivityAt, { milliseconds: 1 })
    const fresh = new Topic({
      id: TopicId.make(randomUUID()),
      title,
      status: "unresolved",
      stakes: "low",
      summary: "",
      sourceMessageIds: ids,
      folded: false,
      model: current.value.model,
      ...(current.value.modelPinned === true ? { modelPinned: true } : {}),
      lastActivityAt: DateTime.max(now, after),
    })
    const topic = yield* ensureFolder(fs, home, fresh)
    yield* store.upsertTopic(topic)
    yield* store.refile(ids, topic.id)
    yield* bus.publish({
      _tag: "MessagesRefiled",
      messageIds: ids,
      topicId: topic.id,
      topicTitle: title,
    })
    yield* bus.markPlaced(run.messageId)
    const path = folderPath(home, topic.folder ?? folderName(title))
    return (
      `Started the topic "${title}"; this exchange now lives there and the user's next messages ` +
      `continue in it. Its folder is ${path}: write its notes.md now (what it's about, decisions, ` +
      "next steps) and put or copy its files there. Tell the user in one short sentence."
    )
  })

  const renameTopic = Effect.fn("Placement.renameTopic")(function* (run: ActiveRun, title: string) {
    const current = yield* store.getTopic(run.topicId)
    if (Option.isNone(current)) return "That conversation no longer exists."
    // A provider session is tied to its working directory, so a moved folder starts a fresh one
    // (seeded with recent messages).
    const { providerSessionId: _tiedToOldFolder, ...rest } = current.value
    let folder = current.value.folder
    if (folder !== undefined && folderName(title) !== folder) {
      const renamed = yield* freeFolderName(fs, home, title)
      yield* fs.rename(folderPath(home, folder), folderPath(home, renamed)).pipe(Effect.orDie)
      folder = renamed
    }
    yield* store.upsertTopic(
      new Topic({ ...rest, title, ...(folder === undefined ? {} : { folder }) }),
    )
    yield* bus.markPlaced(run.messageId)
    const path = folderPath(home, folder ?? folderName(title))
    return (
      `Renamed this topic to "${title}". Its folder is now ${path}; anything you wrote under the ` +
      "old folder path is there now. Tell the user in one short sentence."
    )
  })

  return { startTopic, renameTopic }
}
