import { NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { ChatBus } from "../chat/ChatBus.ts"
import { ChatStore } from "../chat/ChatStore.ts"
import { Conductor } from "../conductor/Conductor.ts"
import { Filer } from "../conductor/Filer.ts"
import { Tasks } from "../conductor/Tasks.ts"
import { DomoConfig } from "../config/DomoConfig.ts"
import { CheckIns } from "../goals/CheckIns.ts"
import { GoalStore } from "../goals/GoalStore.ts"
import { initHome } from "../init/init.ts"
import { Instructions } from "../instructions/Instructions.ts"
import { Lab } from "../lab/Lab.ts"
import { HomeGit } from "../memory/HomeGit.ts"
import { Memory } from "../memory/Memory.ts"
import { Sleep } from "../memory/Sleep.ts"
import { Notifier } from "../notify/Notifier.ts"
import { Presence } from "../presence/Presence.ts"
import { Tidier } from "../presence/Tidier.ts"
import { ProvidersLive } from "../providers/live.ts"
import { Settings } from "../settings/Settings.ts"
import { DatabaseLive } from "../store/Database.ts"
import { Telemetry } from "../telemetry/Telemetry.ts"
import { VisualCheck } from "../visual/VisualCheck.ts"
import { ServerLive } from "./server.ts"

const Announce = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* DomoConfig
    yield* Effect.logInfo(`starting domo on http://127.0.0.1:${config.port}`)
    yield* Effect.logInfo(
      config.trustedLogins.length > 0
        ? `your devices signed in to Tailscale need no token (${config.trustedLogins.length} login trusted)`
        : "no Tailscale login trusted: every device needs the token (domo pair)",
    )
  }),
)

/**
 * Adds seed skills this home doesn't have yet (new ones arrive with updates).
 * Existing skills are never touched: they're the agent's to refine.
 */
const SeedHome = Layer.effectDiscard(
  Effect.gen(function* () {
    const created = yield* initHome()
    if (created.length === 0) return
    yield* (yield* HomeGit).commit(`chore: seed ${created.join(", ")}`)
    yield* Effect.logInfo(`added to the agent home: ${created.join(", ")}`)
  }).pipe(Effect.catch((error) => Effect.logWarning("couldn't seed the agent home", error))),
)

/** The whole daemon; requires only DomoConfig, so shadow instances can run side by side. */
export const DaemonLive = Layer.mergeAll(
  ServerLive,
  Announce,
  SeedHome,
  Tidier.loop,
  Sleep.loop,
  Lab.loop,
).pipe(
  Layer.provideMerge(Conductor.layer),
  Layer.provide(Filer.layer),
  Layer.provideMerge(Tasks.layer),
  Layer.provideMerge(CheckIns.layer),
  Layer.provideMerge(Lab.layer),
  Layer.provideMerge(Sleep.layer),
  Layer.provideMerge(Memory.layer),
  Layer.provideMerge(Instructions.layer),
  Layer.provideMerge(HomeGit.layer),
  Layer.provideMerge(Tidier.layer),
  Layer.provideMerge(Notifier.layer),
  Layer.provideMerge(Presence.layer),
  Layer.provideMerge(Settings.layer),
  Layer.provideMerge(VisualCheck.layer),
  Layer.provideMerge(
    Layer.mergeAll(ChatStore.layer, ChatBus.layer, Telemetry.layer, GoalStore.layer, ProvidersLive),
  ),
  Layer.provide(DatabaseLive),
  Layer.provide(NodeServices.layer),
)
