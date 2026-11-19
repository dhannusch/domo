import { Effect, Layer } from "effect"
import { DomoConfig } from "../config/DomoConfig.ts"
import { makeClaudeRunner } from "./claude/ClaudeProvider.ts"
import { makeCodexRunner } from "./codex/CodexProvider.ts"
import { layerEcho } from "./EchoProvider.ts"
import { Providers } from "./Providers.ts"

/** Live providers: routes each run to the SDK that owns the model. */
const SdkProviders = Layer.effect(
  Providers,
  Effect.gen(function* () {
    const { auth } = yield* DomoConfig
    const runClaude = makeClaudeRunner(auth)
    const runCodex = makeCodexRunner(auth)
    return Providers.of({
      run: (request) =>
        request.model.provider === "claude" ? runClaude(request) : runCodex(request),
    })
  }),
)

/** The configured provider: real SDKs, or the echo provider (DOMO_PROVIDER=echo). */
export const ProvidersLive = Layer.unwrap(
  Effect.gen(function* () {
    const { provider } = yield* DomoConfig
    return provider === "echo" ? layerEcho : SdkProviders
  }),
)
