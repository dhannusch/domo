import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/**
 * Append-only event log plus local telemetry. Projections (messages, topics)
 * are added by later migrations; never edit a shipped migration.
 */
export const migrations = {
  "0001_events_and_telemetry": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `
    yield* sql`
      CREATE TABLE telemetry (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        tag TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `
    yield* sql`CREATE INDEX telemetry_tag ON telemetry (tag)`
  }),
  "0002_messages_and_topics": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE topics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        stakes TEXT NOT NULL,
        decision TEXT,
        next_step TEXT,
        summary TEXT NOT NULL DEFAULT '',
        source_message_ids TEXT NOT NULL DEFAULT '[]',
        folded INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        provider_session_id TEXT,
        project TEXT,
        last_activity_at TEXT NOT NULL
      )
    `
    yield* sql`
      CREATE TABLE messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        topic_id TEXT NOT NULL REFERENCES topics (id),
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        text TEXT NOT NULL,
        model TEXT,
        reply_to TEXT,
        component TEXT,
        sources TEXT,
        created_at TEXT NOT NULL
      )
    `
    yield* sql`CREATE INDEX messages_topic ON messages (topic_id, seq)`
  }),
  "0003_message_sessions": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // Which provider session has seen this message; anything else gets seeded as context.
    yield* sql`ALTER TABLE messages ADD COLUMN session_id TEXT`
  }),
  "0004_components_and_runs": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`ALTER TABLE messages ADD COLUMN resolution TEXT`
    yield* sql`ALTER TABLE messages ADD COLUMN work TEXT`
    yield* sql`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        message_id TEXT,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `
  }),
  "0005_presence_and_tidies": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // Where each device last was, and how far it has read (message seq).
    yield* sql`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        last_seen TEXT NOT NULL,
        read_through_seq INTEGER NOT NULL DEFAULT 0
      )
    `
    // Each tidy is a reversible batch of folded topics.
    yield* sql`
      CREATE TABLE tidies (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        topic_ids TEXT NOT NULL,
        undone INTEGER NOT NULL DEFAULT 0
      )
    `
  }),
  "0006_goals": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // A goal is small and read whole, so it is stored as one JSON document.
    yield* sql`
      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        next_check_in_at TEXT NOT NULL,
        doc TEXT NOT NULL
      )
    `
  }),
  "0007_memory_index": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // Full-text search over memory notes (the files in ~/.domo/memory are the source of truth;
    // this index is rebuilt from them at startup) and over topic summaries (episodic recall).
    yield* sql`CREATE VIRTUAL TABLE memory_fts USING fts5(slug UNINDEXED, title, body)`
    yield* sql`CREATE VIRTUAL TABLE topic_fts USING fts5(topic_id UNINDEXED, title, summary, decision)`
    yield* sql`INSERT INTO topic_fts (topic_id, title, summary, decision)
      SELECT id, title, summary, COALESCE(decision, '') FROM topics`
    yield* sql`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  }),
  "0008_push": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE push_subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL)`
  }),
}
