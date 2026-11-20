import {
  Message,
  type MessageId,
  type MessageStatus,
  ModelRef,
  RunDetail,
  type RunId,
  Topic,
  TopicId,
} from "@domo/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

/**
 * JSON column: NULL ⇄ absent, text ⇄ parsed JSON. Only the JSON is parsed here;
 * the Message/Topic schema then validates (and decodes dates in) the value.
 */
const JsonColumn = Schema.NullOr(Schema.fromJsonString(Schema.Unknown))

const MessageRow = Schema.Struct({
  id: Schema.String,
  topic_id: Schema.String,
  role: Schema.String,
  status: Schema.String,
  text: Schema.String,
  model: Schema.NullOr(Schema.String),
  reply_to: JsonColumn,
  images: JsonColumn,
  component: JsonColumn,
  sources: JsonColumn,
  resolution: JsonColumn,
  work: JsonColumn,
  created_at: Schema.String,
})

const TopicRow = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.String,
  stakes: Schema.String,
  decision: Schema.NullOr(Schema.String),
  next_step: Schema.NullOr(Schema.String),
  summary: Schema.String,
  source_message_ids: Schema.fromJsonString(Schema.Array(Schema.String)),
  folded: Schema.Number,
  model: Schema.String,
  model_pinned: Schema.Number,
  provider_session_id: Schema.NullOr(Schema.String),
  project: Schema.NullOr(Schema.String),
  folder: Schema.NullOr(Schema.String),
  last_activity_at: Schema.String,
})

const decodeMessageRow = Schema.decodeUnknownEffect(MessageRow)
const decodeTopicRow = Schema.decodeUnknownEffect(TopicRow)
const decodeMessage = Schema.decodeUnknownEffect(Message)
const decodeTopic = Schema.decodeUnknownEffect(Topic)
const encodeMessage = Schema.encodeEffect(Message)
const encodeTopic = Schema.encodeEffect(Topic)

/** Optional fields are omitted (not undefined) under exactOptionalPropertyTypes; output is decoded. */
const present = (key: string, value: unknown) =>
  value === null || value === undefined ? {} : { [key]: value }

const rowToMessage = Effect.fnUntraced(function* (raw: unknown) {
  const row = yield* decodeMessageRow(raw)
  return yield* decodeMessage({
    id: row.id,
    topicId: row.topic_id,
    role: row.role,
    status: row.status,
    text: row.text,
    createdAt: row.created_at,
    ...present("model", row.model),
    ...present("replyTo", row.reply_to),
    ...present("images", row.images),
    ...present("component", row.component),
    ...present("sources", row.sources),
    ...present("resolution", row.resolution),
    ...present("work", row.work),
  })
})

const rowToTopic = Effect.fnUntraced(function* (raw: unknown) {
  const row = yield* decodeTopicRow(raw)
  const [provider, ...rest] = row.model.split(":")
  return yield* decodeTopic({
    id: row.id,
    title: row.title,
    status: row.status,
    stakes: row.stakes,
    summary: row.summary,
    sourceMessageIds: row.source_message_ids,
    folded: row.folded === 1,
    model: { provider, id: rest.join(":") },
    ...(row.model_pinned === 1 ? { modelPinned: true } : {}),
    lastActivityAt: row.last_activity_at,
    ...present("decision", row.decision),
    ...present("nextStep", row.next_step),
    ...present("providerSessionId", row.provider_session_id),
    ...present("project", row.project),
    ...present("folder", row.folder),
  })
})

export interface TidyCandidate {
  readonly id: TopicId
  readonly resolved: boolean
  readonly lastActivityAt: string
  /** Seq of the topic's newest message; folding requires the user to have read past it. */
  readonly lastSeq: number
  readonly openChoices: number
}

/**
 * Projections the chat reads and writes: messages and topics. Storage failures
 * are infrastructure defects — the caller cannot recover from a broken disk.
 */
export class ChatStore extends Context.Service<
  ChatStore,
  {
    insertMessage(message: Message): Effect.Effect<void>
    finishMessage(id: MessageId, text: string, status: MessageStatus): Effect.Effect<Message>
    recentMessages(limit: number): Effect.Effect<ReadonlyArray<Message>>
    earlierMessages(limit: number): Effect.Effect<ReadonlyArray<Message>>
    readonly foldedCount: Effect.Effect<number>
    getMessages(ids: ReadonlyArray<MessageId>): Effect.Effect<ReadonlyArray<Message>>
    messageSeq(id: MessageId): Effect.Effect<number | undefined>
    setFolded(ids: ReadonlyArray<TopicId>, folded: boolean): Effect.Effect<void>
    readonly tidyCandidates: Effect.Effect<ReadonlyArray<TidyCandidate>>
    readonly openChoiceCount: Effect.Effect<number>
    /**
     * Replies still marked as being written when the daemon starts were cut off
     * by a restart; marks them failed so nothing stays "running" forever.
     */
    readonly interruptStreaming: Effect.Effect<number>
    /** Agent replies finished after an ISO instant (for the return line). */
    repliesSince(since: string): Effect.Effect<number>
    /** The topic the conversation is currently in, if any. */
    readonly currentTopic: Effect.Effect<Option.Option<Topic>>
    upsertTopic(topic: Topic): Effect.Effect<void>
    /** Replaces the searchable copy of a topic's notes.md. */
    indexNotes(topicId: TopicId, body: string): Effect.Effect<void>
    /** Topics whose notes match an FTS query, best first. */
    searchNotes(query: string, limit: number): Effect.Effect<ReadonlyArray<TopicId>>
    topicMessages(id: TopicId, limit: number): Effect.Effect<ReadonlyArray<Message>>
    getMessage(id: MessageId): Effect.Effect<Option.Option<Message>>
    getTopic(id: TopicId): Effect.Effect<Option.Option<Topic>>
    /** Unfolded topics, most recently active first. */
    openTopics(limit: number): Effect.Effect<ReadonlyArray<Topic>>
    /** Records that a provider session has seen these messages. */
    markSeen(ids: ReadonlyArray<MessageId>, sessionId: string): Effect.Effect<void>
    /**
     * Finished messages of a topic that the given session hasn't seen (all of
     * them for a new session), oldest first — the context to seed a run with.
     */
    unseenMessages(
      topicId: TopicId,
      sessionId: string | undefined,
      excluding: ReadonlyArray<MessageId>,
      limit: number,
    ): Effect.Effect<ReadonlyArray<Message>>
    /** Moves messages to another topic (the filer's correction). */
    refile(ids: ReadonlyArray<MessageId>, topicId: TopicId): Effect.Effect<void>
    /** Rewrites a message's mutable parts: text, status, component, resolution, work. */
    updateMessage(message: Message): Effect.Effect<void>
    saveRun(messageId: MessageId, detail: RunDetail): Effect.Effect<void>
    getRun(id: RunId): Effect.Effect<Option.Option<RunDetail>>
  }
>()("domo/chat/ChatStore") {
  static readonly layer = Layer.effect(
    ChatStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const insertMessage = Effect.fn("ChatStore.insertMessage")(function* (message: Message) {
        const e = yield* encodeMessage(message)
        yield* sql`
          INSERT INTO messages (id, topic_id, role, status, text, model, reply_to, images, component,
            sources, resolution, work, created_at)
          VALUES (${e.id}, ${e.topicId}, ${e.role}, ${e.status}, ${e.text}, ${e.model ?? null},
            ${e.replyTo === undefined ? null : JSON.stringify(e.replyTo)},
            ${e.images === undefined ? null : JSON.stringify(e.images)},
            ${e.component === undefined ? null : JSON.stringify(e.component)},
            ${e.sources === undefined ? null : JSON.stringify(e.sources)},
            ${e.resolution === undefined ? null : JSON.stringify(e.resolution)},
            ${e.work === undefined ? null : JSON.stringify(e.work)},
            ${e.createdAt})
        `
      }, Effect.orDie)

      const finishMessage = Effect.fn("ChatStore.finishMessage")(function* (
        id: MessageId,
        text: string,
        status: MessageStatus,
      ) {
        yield* sql`UPDATE messages SET text = ${text}, status = ${status} WHERE id = ${id}`
        const rows = yield* sql`SELECT * FROM messages WHERE id = ${id}`
        return yield* rowToMessage(rows[0])
      }, Effect.orDie)

      /** The page: recent messages of topics that aren't folded into "Earlier". */
      const recentMessages = Effect.fn("ChatStore.recentMessages")(function* (limit: number) {
        const rows = yield* sql`
          SELECT * FROM (
            SELECT m.* FROM messages m JOIN topics t ON t.id = m.topic_id
            WHERE t.folded = 0 ORDER BY m.seq DESC LIMIT ${limit}
          ) ORDER BY seq ASC
        `
        return yield* Effect.forEach(rows, rowToMessage)
      }, Effect.orDie)

      /** "Earlier": messages of folded topics, oldest first (chronological, like a normal chat). */
      const earlierMessages = Effect.fn("ChatStore.earlierMessages")(function* (limit: number) {
        const rows = yield* sql`
          SELECT * FROM (
            SELECT m.* FROM messages m JOIN topics t ON t.id = m.topic_id
            WHERE t.folded = 1 ORDER BY m.seq DESC LIMIT ${limit}
          ) ORDER BY seq ASC
        `
        return yield* Effect.forEach(rows, rowToMessage)
      }, Effect.orDie)

      const foldedCount = sql<{
        n: number
      }>`SELECT COUNT(*) AS n FROM topics WHERE folded = 1`.pipe(
        Effect.map((rows) => rows[0]?.n ?? 0),
        Effect.orDie,
      )

      const getMessages = Effect.fn("ChatStore.getMessages")(function* (
        ids: ReadonlyArray<MessageId>,
      ) {
        if (ids.length === 0) return []
        const rows = yield* sql`SELECT * FROM messages WHERE ${sql.in("id", ids)} ORDER BY seq ASC`
        return yield* Effect.forEach(rows, rowToMessage)
      }, Effect.orDie)

      const messageSeq = Effect.fn("ChatStore.messageSeq")(function* (id: MessageId) {
        const rows = yield* sql<{ seq: number }>`SELECT seq FROM messages WHERE id = ${id}`
        return rows[0]?.seq
      }, Effect.orDie)

      const setFolded = Effect.fn("ChatStore.setFolded")(function* (
        ids: ReadonlyArray<TopicId>,
        folded: boolean,
      ) {
        if (ids.length === 0) return
        yield* sql`UPDATE topics SET folded = ${folded ? 1 : 0} WHERE ${sql.in("id", ids)}`
      }, Effect.orDie)

      /** Per-topic facts the Tidier needs, for every unfolded topic. */
      const tidyCandidates = sql<{
        id: string
        status: string
        last_activity_at: string
        last_seq: number
        open_choices: number
      }>`
        SELECT t.id, t.status, t.last_activity_at,
          COALESCE(MAX(m.seq), 0) AS last_seq,
          SUM(CASE WHEN (m.component LIKE '%"_tag":"Choice"%' OR m.component LIKE '%"_tag":"Questions"%') AND m.resolution IS NULL THEN 1 ELSE 0 END) AS open_choices
        FROM topics t LEFT JOIN messages m ON m.topic_id = t.id
        WHERE t.folded = 0
        GROUP BY t.id
      `.pipe(
        Effect.map((rows) =>
          rows.map((row) => ({
            id: TopicId.make(row.id),
            resolved: row.status === "resolved",
            lastActivityAt: row.last_activity_at,
            lastSeq: row.last_seq,
            openChoices: row.open_choices ?? 0,
          })),
        ),
        Effect.orDie,
      )

      const openChoiceCount = sql<{ n: number }>`
        SELECT COUNT(*) AS n FROM messages WHERE (component LIKE '%"_tag":"Choice"%' OR component LIKE '%"_tag":"Questions"%') AND resolution IS NULL AND status = 'done'
      `.pipe(
        Effect.map((rows) => rows[0]?.n ?? 0),
        Effect.orDie,
      )

      const repliesSince = Effect.fn("ChatStore.repliesSince")(function* (since: string) {
        const rows = yield* sql<{ n: number }>`
          SELECT COUNT(*) AS n FROM messages WHERE role = 'agent' AND status = 'done' AND created_at > ${since}
        `
        return rows[0]?.n ?? 0
      }, Effect.orDie)

      const topicMessages = Effect.fn("ChatStore.topicMessages")(function* (
        id: TopicId,
        limit: number,
      ) {
        const rows =
          yield* sql`SELECT * FROM (SELECT * FROM messages WHERE topic_id = ${id} ORDER BY seq DESC LIMIT ${limit}) ORDER BY seq ASC`
        return yield* Effect.forEach(rows, rowToMessage)
      }, Effect.orDie)

      const currentTopic =
        sql`SELECT * FROM topics WHERE folded = 0 ORDER BY last_activity_at DESC LIMIT 1`.pipe(
          Effect.flatMap((rows) =>
            rows[0] === undefined
              ? Effect.succeed(Option.none())
              : rowToTopic(rows[0]).pipe(Effect.map(Option.some)),
          ),
          Effect.orDie,
        )

      const upsertTopic = Effect.fn("ChatStore.upsertTopic")(function* (topic: Topic) {
        const e = yield* encodeTopic(topic)
        const model = new ModelRef(topic.model).key
        yield* sql`
          INSERT INTO topics (id, title, status, stakes, decision, next_step, summary, source_message_ids,
            folded, model, model_pinned, provider_session_id, project, folder, last_activity_at)
          VALUES (${e.id}, ${e.title}, ${e.status}, ${e.stakes}, ${e.decision ?? null}, ${e.nextStep ?? null},
            ${e.summary}, ${JSON.stringify(e.sourceMessageIds)}, ${topic.folded ? 1 : 0}, ${model}, ${topic.modelPinned === true ? 1 : 0},
            ${e.providerSessionId ?? null}, ${e.project ?? null}, ${e.folder ?? null}, ${e.lastActivityAt})
          ON CONFLICT (id) DO UPDATE SET
            title = excluded.title, status = excluded.status, stakes = excluded.stakes,
            decision = excluded.decision, next_step = excluded.next_step, summary = excluded.summary,
            source_message_ids = excluded.source_message_ids, folded = excluded.folded,
            model = excluded.model, model_pinned = excluded.model_pinned, provider_session_id = excluded.provider_session_id,
            project = excluded.project, folder = COALESCE(excluded.folder, topics.folder), last_activity_at = excluded.last_activity_at
        `
        // Keep episodic recall in step with the topic's latest summary.
        yield* sql`DELETE FROM topic_fts WHERE topic_id = ${e.id}`
        yield* sql`INSERT INTO topic_fts (topic_id, title, summary, decision)
          VALUES (${e.id}, ${e.title}, ${e.summary}, ${e.decision ?? ""})`
      }, Effect.orDie)

      const indexNotes = Effect.fn("ChatStore.indexNotes")(function* (
        topicId: TopicId,
        body: string,
      ) {
        yield* sql`DELETE FROM notes_fts WHERE topic_id = ${topicId}`
        if (body.trim().length > 0)
          yield* sql`INSERT INTO notes_fts (topic_id, body) VALUES (${topicId}, ${body})`
      }, Effect.orDie)

      const searchNotes = (query: string, limit: number) =>
        sql<{ topic_id: string }>`
          SELECT topic_id FROM notes_fts WHERE notes_fts MATCH ${query} ORDER BY bm25(notes_fts) LIMIT ${limit}
        `.pipe(
          Effect.map((rows) => rows.map((row) => TopicId.make(row.topic_id))),
          Effect.orElseSucceed(() => []),
        )

      const firstOrNone =
        <A>(decode: (row: unknown) => Effect.Effect<A, unknown>) =>
        (rows: ReadonlyArray<unknown>) =>
          rows[0] === undefined
            ? Effect.succeed(Option.none<A>())
            : decode(rows[0]).pipe(Effect.map(Option.some))

      const getMessage = Effect.fn("ChatStore.getMessage")(function* (id: MessageId) {
        return yield* firstOrNone(rowToMessage)(yield* sql`SELECT * FROM messages WHERE id = ${id}`)
      }, Effect.orDie)

      const getTopic = Effect.fn("ChatStore.getTopic")(function* (id: TopicId) {
        return yield* firstOrNone(rowToTopic)(yield* sql`SELECT * FROM topics WHERE id = ${id}`)
      }, Effect.orDie)

      const openTopics = Effect.fn("ChatStore.openTopics")(function* (limit: number) {
        const rows =
          yield* sql`SELECT * FROM topics WHERE folded = 0 ORDER BY last_activity_at DESC LIMIT ${limit}`
        return yield* Effect.forEach(rows, rowToTopic)
      }, Effect.orDie)

      const markSeen = Effect.fn("ChatStore.markSeen")(function* (
        ids: ReadonlyArray<MessageId>,
        sessionId: string,
      ) {
        if (ids.length === 0) return
        yield* sql`UPDATE messages SET session_id = ${sessionId} WHERE ${sql.in("id", ids)}`
      }, Effect.orDie)

      const unseenMessages = Effect.fn("ChatStore.unseenMessages")(function* (
        topicId: TopicId,
        sessionId: string | undefined,
        excluding: ReadonlyArray<MessageId>,
        limit: number,
      ) {
        const notExcluded =
          excluding.length === 0 ? sql`1 = 1` : sql`id NOT IN ${sql.in(excluding)}`
        const unseen =
          sessionId === undefined
            ? sql`1 = 1`
            : sql`(session_id IS NULL OR session_id != ${sessionId})`
        const rows = yield* sql`
          SELECT * FROM (
            SELECT * FROM messages
            WHERE topic_id = ${topicId} AND status = 'done' AND ${unseen} AND ${notExcluded}
            ORDER BY seq DESC LIMIT ${limit}
          ) ORDER BY seq ASC
        `
        return yield* Effect.forEach(rows, rowToMessage)
      }, Effect.orDie)

      const refile = Effect.fn("ChatStore.refile")(function* (
        ids: ReadonlyArray<MessageId>,
        topicId: TopicId,
      ) {
        if (ids.length === 0) return
        yield* sql`UPDATE messages SET topic_id = ${topicId} WHERE ${sql.in("id", ids)}`
      }, Effect.orDie)

      const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value))
      const encodeRun = Schema.encodeEffect(Schema.fromJsonString(RunDetail))
      const decodeRun = Schema.decodeUnknownEffect(
        Schema.Struct({ detail: Schema.fromJsonString(RunDetail) }),
      )

      const updateMessage = Effect.fn("ChatStore.updateMessage")(function* (message: Message) {
        const e = yield* encodeMessage(message)
        yield* sql`
          UPDATE messages SET text = ${e.text}, status = ${e.status},
            component = ${json(e.component)}, resolution = ${json(e.resolution)}, work = ${json(e.work)}
          WHERE id = ${e.id}
        `
      }, Effect.orDie)

      const saveRun = Effect.fn("ChatStore.saveRun")(function* (
        messageId: MessageId,
        detail: RunDetail,
      ) {
        const encoded = yield* encodeRun(detail)
        const now = DateTime.formatIso(yield* DateTime.now)
        yield* sql`
          INSERT INTO runs (id, message_id, detail, created_at) VALUES (${detail.id}, ${messageId}, ${encoded}, ${now})
          ON CONFLICT (id) DO UPDATE SET detail = excluded.detail
        `
      }, Effect.orDie)

      const getRun = Effect.fn("ChatStore.getRun")(function* (id: RunId) {
        const rows = yield* sql`SELECT detail FROM runs WHERE id = ${id}`
        return yield* firstOrNone((row) => decodeRun(row).pipe(Effect.map((r) => r.detail)))(rows)
      }, Effect.orDie)

      const interruptStreaming = Effect.gen(function* () {
        const rows = yield* sql<{
          n: number
        }>`SELECT COUNT(*) AS n FROM messages WHERE status = 'streaming'`
        yield* sql`
          UPDATE messages SET status = 'failed',
            text = CASE WHEN text = '' THEN 'Interrupted when Domo restarted.' ELSE text END,
            work = CASE WHEN work IS NULL THEN NULL ELSE json_set(work, '$.status', 'failed') END
          WHERE status = 'streaming'
        `
        return rows[0]?.n ?? 0
      }).pipe(Effect.orDie)

      return ChatStore.of({
        interruptStreaming,
        earlierMessages,
        foldedCount,
        getMessages,
        messageSeq,
        setFolded,
        tidyCandidates,
        openChoiceCount,
        repliesSince,
        updateMessage,
        saveRun,
        getRun,
        insertMessage,
        finishMessage,
        recentMessages,
        currentTopic,
        upsertTopic,
        indexNotes,
        searchNotes,
        topicMessages,
        getMessage,
        getTopic,
        openTopics,
        markSeen,
        unseenMessages,
        refile,
      })
    }),
  )
}
