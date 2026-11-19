import { createServer } from "node:http"
import { join } from "node:path"
import { DomoRpc } from "@domo/domain"
import { NodeHttpServer } from "@effect/platform-node"
import { DateTime, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { Conductor } from "../conductor/Conductor.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { CheckIns } from "../goals/CheckIns.ts"
import { Instructions } from "../instructions/Instructions.ts"
import { Lab } from "../lab/Lab.ts"
import { DomoMcpLive } from "../mcp/DomoMcp.ts"
import { Memory } from "../memory/Memory.ts"
import { modelOptions } from "../models/registry.ts"
import { Notifier } from "../notify/Notifier.ts"
import { Presence } from "../presence/Presence.ts"
import { Tidier } from "../presence/Tidier.ts"
import { Settings } from "../settings/Settings.ts"
import { Telemetry } from "../telemetry/Telemetry.ts"
import { AccessLive } from "./access.ts"

const WEB_DIST = join(import.meta.dirname, "../../../web/dist")

const RpcHandlers = DomoRpc.toLayer(
  Effect.gen(function* () {
    const conductor = yield* Conductor
    const store = yield* ChatStore
    const bus = yield* ChatBus
    const telemetry = yield* Telemetry
    const presence = yield* Presence
    const tidier = yield* Tidier
    const checkIns = yield* CheckIns
    const notifier = yield* Notifier
    const settings = yield* Settings
    const memory = yield* Memory
    const lab = yield* Lab
    const instructions = yield* Instructions
    const clamp = (limit: number) => Math.min(Math.max(limit, 1), 500)
    return DomoRpc.of({
      Send: (payload) => conductor.send(payload),
      Answer: (payload) => conductor.answer(payload),
      Check: ({ messageId, index, done }) => conductor.check(messageId, index, done),
      History: ({ limit }) =>
        Effect.all({ messages: store.recentMessages(clamp(limit)), earlier: store.foldedCount }),
      Earlier: ({ limit }) => store.earlierMessages(clamp(limit)),
      Messages: ({ ids }) => store.getMessages(ids.slice(0, 50)),
      Presence: ({ deviceId, readThrough }) =>
        presence.touch(deviceId, readThrough).pipe(
          Effect.tap(({ greeting }) => (greeting ? checkIns.runInBackground : Effect.void)),
          Effect.map(({ summary }) => Option.getOrNull(summary)),
        ),
      UndoTidy: ({ id }) => tidier.undo(id),
      UndoAnswer: ({ messageId }) => conductor.undoAnswer(messageId),
      NotQuite: ({ messageId }) => conductor.notQuite(messageId),
      Feed: () => bus.feed,
      Run: ({ runId }) => store.getRun(runId).pipe(Effect.map(Option.getOrNull)),
      Models: () => Effect.succeed(modelOptions),
      Settings: () =>
        Effect.all({
          settings: settings.current,
          profile: memory.profile,
          notes: Effect.map(memory.notes, (notes) => notes.length),
          labChanges: Effect.map(lab.changes, (changes) => changes.slice(0, 10)),
          devices: presence.devices,
        }),
      UpdateSettings: ({ patch }) => settings.update(patch),
      UndoLabChange: ({ id }) => lab.undo(id),
      Instructions: () => instructions.read,
      SaveInstructions: ({ text }) => instructions.save(text, "you"),
      PushKey: () => Effect.succeed(notifier.publicKey),
      Subscribe: ({ subscription }) => notifier.subscribe(subscription),
      Track: ({ event }) => telemetry.record(event),
    })
  }),
)

const RpcRoute = RpcServer.layerHttp({ group: DomoRpc, path: "/rpc", protocol: "websocket" }).pipe(
  Layer.provide(RpcHandlers),
  Layer.provide(RpcSerialization.layerNdjson),
)

/** Public liveness check; `domo update` uses `startedAt` to see that the new daemon is up. */
const HealthRoute = Layer.unwrap(
  Effect.gen(function* () {
    const body = JSON.stringify({ ok: true, startedAt: DateTime.formatIso(yield* DateTime.now) })
    return HttpRouter.add(
      "GET",
      "/health",
      HttpServerResponse.text(body, { contentType: "application/json" }),
    )
  }),
)

/** The built PWA. In development Vite serves the UI and proxies /rpc here. */
const StaticRoute = HttpStaticServer.layer({ root: WEB_DIST, spa: true })

/**
 * HTTP server on localhost only. Remote access is Tailscale's job (`tailscale
 * serve`), so nothing is exposed to the network directly.
 */
export const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DomoConfig
    return HttpRouter.serve(
      Layer.mergeAll(AccessLive, HealthRoute, RpcRoute, DomoMcpLive, StaticRoute),
    ).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { port: config.port, host: "127.0.0.1" })),
    )
  }),
)
