import { dirname } from "node:path"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Effect, FileSystem, Layer } from "effect"
import { DomoConfig } from "../config/DomoConfig.ts"
import { migrations } from "./migrations.ts"

const Migrations = SqliteMigrator.layer({ loader: SqliteMigrator.fromRecord(migrations) })

/** A migrated SQLite database at `DomoConfig.dbPath`. */
export const DatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DomoConfig
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(dirname(config.dbPath), { recursive: true }).pipe(Effect.orDie)
    return Migrations.pipe(Layer.provideMerge(SqliteClient.layer({ filename: config.dbPath })))
  }),
)

/** In-memory database for tests. */
export const DatabaseTest = Migrations.pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
)
