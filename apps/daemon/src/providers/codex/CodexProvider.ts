import type { AgentEvent } from "@domo/domain"
import { Codex, type ThreadOptions } from "@openai/codex-sdk"
import { Effect, Stream } from "effect"
import { type AuthMode, subprocessEnv } from "../auth.ts"
import { ProviderError, type RunRequest } from "../Providers.ts"
import { initialAccumulator, mapCodexEvent } from "./mapping.ts"

/** Model id "default" means: let Codex use the model configured in ~/.codex/config.toml. */
export const CODEX_DEFAULT_MODEL = "default"

const toError = (cause: unknown) =>
  new ProviderError({
    provider: "codex",
    message: cause instanceof Error ? cause.message : String(cause),
  })

const threadOptions = (request: RunRequest): ThreadOptions => ({
  // High autonomy inside the working directory; guarded actions go through ask_user.
  // Utility runs (routing, filing, summaries) never need to write.
  sandboxMode: request.mode === "utility" ? "read-only" : "workspace-write",
  approvalPolicy: "never",
  // No network for any Codex run: Codex has no per-command hook, so guarded actions that need the
  // network (git push, deploys, sending anything) are impossible rather than merely discouraged.
  // Its built-in web search still works; it isn't a sandboxed shell command.
  networkAccessEnabled: false,
  skipGitRepoCheck: true,
  ...(request.model.id === CODEX_DEFAULT_MODEL ? {} : { model: request.model.id }),
  ...(request.cwd === undefined ? {} : { workingDirectory: request.cwd }),
})

/**
 * Runs one turn on the Codex SDK with the user's own `codex login`. Codex has
 * no system-prompt option, so instructions are prepended on a new thread only.
 */
export const makeCodexRunner =
  (auth: AuthMode) =>
  (request: RunRequest): Stream.Stream<AgentEvent, ProviderError> =>
    Stream.suspend(() => {
      // MCP servers are CLI config, so each run gets its own client (cheap: no process until it runs).
      const codex = makeCodex(auth, request.mode === "utility" ? undefined : request.mcp)
      const abortController = new AbortController()
      const thread =
        request.sessionId === undefined
          ? codex.startThread(threadOptions(request))
          : codex.resumeThread(request.sessionId, threadOptions(request))
      const input =
        request.sessionId === undefined && request.systemPrompt !== undefined
          ? `${request.systemPrompt}\n\n---\n\n${request.prompt}`
          : request.prompt

      return Stream.unwrap(
        Effect.tryPromise({
          try: () => thread.runStreamed(input, { signal: abortController.signal }),
          catch: toError,
        }).pipe(Effect.map((turn) => Stream.fromAsyncIterable(turn.events, toError))),
      ).pipe(
        Stream.mapAccum(() => initialAccumulator, mapCodexEvent(request.runId)),
        Stream.ensuring(Effect.sync(() => abortController.abort())),
      )
    })

/** The SDK stops inheriting process.env once `env` is set; API keys are stripped in subscription mode. */
const makeCodex = (auth: AuthMode, mcp: RunRequest["mcp"]): Codex =>
  new Codex({
    env: subprocessEnv(auth, process.env),
    ...(mcp === undefined
      ? {}
      : {
          config: {
            mcp_servers: {
              domo: {
                url: mcp.url,
                http_headers: { ...mcp.headers },
                // Domo's own tools only show UI in the chat; without this, Codex blocks
                // every MCP call under approval policy "never". Other servers keep Codex's rules.
                default_tools_approval_mode: "approve",
                // Delegations and councils can take many minutes (Codex defaults to 60s).
                tool_timeout_sec: 30 * 60,
              },
            },
          },
        }),
  })
