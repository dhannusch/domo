import { Goal, type GoalId } from "@domo/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

const GoalJson = Schema.fromJsonString(Goal)
const encode = Schema.encodeEffect(GoalJson)
const decode = Schema.decodeUnknownEffect(GoalJson)

/** Goals as whole documents, with status and next check-in indexed for the check-in loop. */
export class GoalStore extends Context.Service<
  GoalStore,
  {
    save(goal: Goal): Effect.Effect<void>
    get(id: GoalId): Effect.Effect<Option.Option<Goal>>
    readonly active: Effect.Effect<ReadonlyArray<Goal>>
    /** Active goals whose next check-in has come. */
    due(now: DateTime.Utc): Effect.Effect<ReadonlyArray<Goal>>
  }
>()("domo/goals/GoalStore") {
  static readonly layer = Layer.effect(
    GoalStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rowsToGoals = (rows: ReadonlyArray<{ doc: string }>) =>
        Effect.forEach(rows, (row) => decode(row.doc))

      const save = Effect.fn("GoalStore.save")(function* (goal: Goal) {
        const doc = yield* encode(goal)
        const next = DateTime.formatIso(goal.nextCheckInAt)
        yield* sql`
          INSERT INTO goals (id, status, next_check_in_at, doc) VALUES (${goal.id}, ${goal.status}, ${next}, ${doc})
          ON CONFLICT (id) DO UPDATE SET status = excluded.status,
            next_check_in_at = excluded.next_check_in_at, doc = excluded.doc
        `
      }, Effect.orDie)

      const get = Effect.fn("GoalStore.get")(function* (id: GoalId) {
        const goals = yield* rowsToGoals(
          yield* sql<{ doc: string }>`SELECT doc FROM goals WHERE id = ${id}`,
        )
        return Option.fromNullishOr(goals[0])
      }, Effect.orDie)

      const active = sql<{
        doc: string
      }>`SELECT doc FROM goals WHERE status = 'active' ORDER BY next_check_in_at`.pipe(
        Effect.flatMap(rowsToGoals),
        Effect.orDie,
      )

      const due = Effect.fn("GoalStore.due")(function* (now: DateTime.Utc) {
        const rows = yield* sql<{ doc: string }>`
          SELECT doc FROM goals WHERE status = 'active' AND next_check_in_at <= ${DateTime.formatIso(now)}
          ORDER BY next_check_in_at
        `
        return yield* rowsToGoals(rows)
      }, Effect.orDie)

      return GoalStore.of({ save, get, active, due })
    }),
  )
}
