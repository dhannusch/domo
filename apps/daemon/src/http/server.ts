import { createServer } from "node:http"
import { join } from "node:path"
import { DomoRpc, RunId } from "@domo/domain"
import { NodeHttpServer } from "@effect/platform-node"
import { DateTime, Effect, FileSystem, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse, HttpStaticServer } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { Conductor } from "../conductor/Conductor.ts"
import { Tasks } from "../conductor/Tasks.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { CheckIns } from "../goals/CheckIns.ts"
import { Images } from "../images/Images.ts"
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
    const tasks = yield* Tasks
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
      Presence: ({ deviceId, readThrough, label }) =>
        presence.touch(deviceId, readThrough, label).pipe(
          Effect.tap(({ greeting }) => (greeting ? checkIns.runInBackground : Effect.void)),
          Effect.map(({ summary }) => Option.getOrNull(summary)),
        ),
      UndoTidy: ({ id }) => tidier.undo(id),
      UndoAnswer: ({ messageId }) => conductor.undoAnswer(messageId),
      NotQuite: ({ messageId }) => conductor.notQuite(messageId),
      Stop: ({ messageId }) =>
        conductor.stop(messageId).pipe(
          Effect.flatMap((stopped) => (stopped ? Effect.void : tasks.stopReply(messageId))),
          Effect.asVoid,
        ),
      Feed: () => bus.feed,
      Run: ({ runId }) => store.getRun(runId).pipe(Effect.map(Option.getOrNull)),
      Models: () => Effect.succeed(modelOptions),
      Settings: () =>
        Effect.all({
          settings: settings.current,
          profile: memory.profile,
          notes: Effect.map(memory.notes, (notes) => notes.length),
          memories: Effect.map(memory.notes, (notes) =>
            [...notes]
              .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
              .map((n) => ({ name: n.name, type: n.type, body: n.body, lastUsed: n.lastUsed })),
          ),
          labChanges: Effect.map(lab.changes, (changes) => changes.slice(0, 10)),
          devices: presence.devices,
        }),
      UpdateSettings: ({ patch }) => settings.update(patch),
      ForgetMemory: ({ name }) =>
        memory.forget(name, "removed by the user in Settings").pipe(Effect.asVoid),
      UndoLabChange: ({ id }) => lab.undo(id),
      Instructions: () => instructions.read,
      SaveInstructions: ({ text }) => instructions.save(text, "you"),
      PushKey: () => Effect.succeed(notifier.publicKey),
      Subscribe: ({ subscription, deviceId }) => notifier.subscribe(subscription, deviceId),
      TestPush: () => notifier.test,
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

/** Attached images: uploaded before the message is sent, then shown in the chat. Protected. */
const ImageRoutes = Layer.mergeAll(
  HttpRouter.add(
    "POST",
    "/images",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const body = new Uint8Array(yield* request.arrayBuffer)
      const saved = yield* (yield* Images).save(body, request.headers["content-type"] ?? "")
      return yield* HttpServerResponse.json(saved)
    }).pipe(
      Effect.catchTag("ImageRejected", (error) =>
        Effect.succeed(HttpServerResponse.text(error.message, { status: 400 })),
      ),
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.text("Couldn't read that upload.", { status: 400 })),
      ),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/images/:id",
    Effect.gen(function* () {
      const { id } = yield* HttpRouter.params
      const found = yield* (yield* Images).find(id ?? "")
      if (Option.isNone(found)) return HttpServerResponse.empty({ status: 404 })
      return yield* HttpServerResponse.file(found.value.path, {
        contentType: found.value.mediaType,
        headers: { "cache-control": "private, max-age=31536000, immutable" },
      })
    }).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 404 })))),
  ),
)

/**
 * Files Domo attached to a reply. Each is served sandboxed (an opaque origin with no access to
 * the app, its token or the network); a deck's own scripts may run for navigation, and web fonts
 * may load from Google Fonts.
 */
const AttachmentRoute = HttpRouter.add(
  "GET",
  "/attachments/:id",
  Effect.gen(function* () {
    const { id } = yield* HttpRouter.params
    const found = yield* (yield* Images).findFile(id ?? "")
    if (Option.isNone(found)) return HttpServerResponse.empty({ status: 404 })
    const text = found.value.mediaType.startsWith("text/") && found.value.mediaType !== "text/html"
    return yield* HttpServerResponse.file(found.value.path, {
      contentType: text ? `${found.value.mediaType}; charset=utf-8` : found.value.mediaType,
      headers: {
        "content-security-policy":
          "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; " +
          "style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; " +
          "img-src data: blob:",
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=31536000, immutable",
      },
    })
  }).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 404 })))),
)

/** The most of one file "view" will show. */
const FILE_LIMIT = 2 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
}

/**
 * A file a run changed, for "view". Only files recorded on that run are served, by position, so
 * this can't be used to read anything else on the machine. Text is always served as plain text
 * (never as a page that could run), images as themselves.
 */
const FileRoute = HttpRouter.add(
  "GET",
  "/files/:runId/:index",
  Effect.gen(function* () {
    const { runId, index } = yield* HttpRouter.params
    const run = yield* (yield* ChatStore).getRun(RunId.make(runId ?? ""))
    const path = Option.isSome(run) ? run.value.files[Number(index)] : undefined
    if (path === undefined) return HttpServerResponse.empty({ status: 404 })
    const fs = yield* FileSystem.FileSystem
    const info = yield* fs.stat(path)
    if (info.type !== "File" || Number(info.size) > FILE_LIMIT)
      return HttpServerResponse.text("That file is gone or too large to show here.", {
        status: 404,
      })
    const image = IMAGE_TYPES[path.split(".").at(-1)?.toLowerCase() ?? ""]
    return HttpServerResponse.uint8Array(yield* fs.readFile(path), {
      contentType: image ?? "text/plain; charset=utf-8",
      headers: {
        "content-security-policy": "default-src 'none'; img-src 'self'",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    })
  }).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.empty({ status: 404 })))),
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
      Layer.mergeAll(
        AccessLive,
        HealthRoute,
        RpcRoute,
        DomoMcpLive,
        ImageRoutes,
        FileRoute,
        AttachmentRoute,
        StaticRoute,
      ),
    ).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { port: config.port, host: "127.0.0.1" })),
    )
  }),
)
