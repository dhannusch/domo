import type { ChatEvent, MessageId, RunDetail, RunId, TopicId } from "@domo/domain"
import { Context, Deferred, Effect, Layer, Option, PubSub, Ref, Stream } from "effect"

/** Which message a live run is writing; tools called during the run attach to it. */
export interface ActiveRun {
  readonly messageId: MessageId
  readonly topicId: TopicId
}

export type Delegation = NonNullable<RunDetail["delegations"]>[number]

/** How an ask_user question was settled. */
export type AskAnswer =
  | {
      readonly _tag: "Answered"
      readonly value: string
      readonly label: string
      readonly freeText: boolean
    }
  | { readonly _tag: "MovedOn" }

/**
 * The live side of the chat: the event feed every client subscribes to, and the
 * registry of runs in flight. Shared by the Conductor and the DomoMcp tools so
 * neither depends on the other.
 */
export class ChatBus extends Context.Service<
  ChatBus,
  {
    publish(event: ChatEvent): Effect.Effect<void>
    readonly feed: Stream.Stream<ChatEvent>
    registerRun(runId: RunId, run: ActiveRun): Effect.Effect<void>
    unregisterRun(runId: RunId): Effect.Effect<void>
    lookupRun(runId: RunId): Effect.Effect<Option.Option<ActiveRun>>
    /** Work a run handed to other models, for its receipt and "view". */
    recordDelegation(runId: RunId, delegation: Delegation): Effect.Effect<void>
    takeDelegations(runId: RunId): Effect.Effect<ReadonlyArray<Delegation>>
    /** The agent placed this reply's exchange itself (start_topic/rename_topic): skip filing. */
    markPlaced(messageId: MessageId): Effect.Effect<void>
    /** Whether the reply was placed by the agent; asking forgets it. */
    takePlaced(messageId: MessageId): Effect.Effect<boolean>
    /** An agent is waiting on the user's answer to this message's question. */
    registerAsk(messageId: MessageId): Effect.Effect<Deferred.Deferred<AskAnswer>>
    /** Settles a waiting question; false if nothing was waiting. */
    completeAsk(messageId: MessageId, answer: AskAnswer): Effect.Effect<boolean>
    /** The user moved on: every waiting question is released so the chat never stalls. */
    readonly releaseAsks: Effect.Effect<void>
    /** Guarded actions the user approved during a run (by category, e.g. "git push"). */
    approve(runId: RunId, action: string): Effect.Effect<void>
    isApproved(runId: RunId, action: string): Effect.Effect<boolean>
  }
>()("domo/chat/ChatBus") {
  static readonly layer = Layer.effect(
    ChatBus,
    Effect.gen(function* () {
      const events = yield* PubSub.unbounded<ChatEvent>()
      const runs = yield* Ref.make<ReadonlyMap<RunId, ActiveRun>>(new Map())
      const delegations = yield* Ref.make<ReadonlyMap<RunId, ReadonlyArray<Delegation>>>(new Map())
      const asks = yield* Ref.make<ReadonlyMap<MessageId, Deferred.Deferred<AskAnswer>>>(new Map())
      const approvals = yield* Ref.make<ReadonlyMap<RunId, ReadonlySet<string>>>(new Map())
      const placed = yield* Ref.make<ReadonlySet<MessageId>>(new Set())

      const takeAsk = (messageId: MessageId) =>
        Ref.modify(asks, (m) => {
          const next = new Map(m)
          next.delete(messageId)
          return [m.get(messageId), next] as const
        })
      return ChatBus.of({
        publish: (event) => PubSub.publish(events, event).pipe(Effect.asVoid),
        feed: Stream.fromPubSub(events),
        registerRun: (runId, run) => Ref.update(runs, (m) => new Map(m).set(runId, run)),
        unregisterRun: (runId) =>
          Ref.update(runs, (m) => {
            const next = new Map(m)
            next.delete(runId)
            return next
          }),
        recordDelegation: (runId, delegation) =>
          Ref.update(delegations, (m) =>
            new Map(m).set(runId, [...(m.get(runId) ?? []), delegation]),
          ),
        takeDelegations: (runId) =>
          Ref.modify(delegations, (m) => {
            const next = new Map(m)
            next.delete(runId)
            return [m.get(runId) ?? [], next] as const
          }),
        markPlaced: (messageId) => Ref.update(placed, (s) => new Set(s).add(messageId)),
        takePlaced: (messageId) =>
          Ref.modify(placed, (s) => {
            const next = new Set(s)
            next.delete(messageId)
            return [s.has(messageId), next] as const
          }),
        registerAsk: (messageId) =>
          Deferred.make<AskAnswer>().pipe(
            Effect.tap((deferred) => Ref.update(asks, (m) => new Map(m).set(messageId, deferred))),
          ),
        completeAsk: (messageId, answer) =>
          takeAsk(messageId).pipe(
            Effect.flatMap((deferred) =>
              deferred === undefined ? Effect.succeed(false) : Deferred.succeed(deferred, answer),
            ),
          ),
        releaseAsks: Ref.getAndSet(asks, new Map()).pipe(
          Effect.flatMap((m) =>
            Effect.forEach([...m.values()], (d) => Deferred.succeed(d, { _tag: "MovedOn" }), {
              discard: true,
            }),
          ),
        ),
        approve: (runId, action) =>
          Ref.update(approvals, (m) =>
            new Map(m).set(runId, new Set([...(m.get(runId) ?? []), action])),
          ),
        isApproved: (runId, action) =>
          Ref.get(approvals).pipe(Effect.map((m) => m.get(runId)?.has(action) ?? false)),
        lookupRun: (runId) =>
          Ref.get(runs).pipe(Effect.map((m) => Option.fromNullishOr(m.get(runId)))),
      })
    }),
  )
}
