import type { AgentEvent, ImageMediaType, ModelRef, RunId } from "@domo/domain"
import { Context, Schema, type Stream } from "effect"

export interface RunRequest {
  readonly runId: RunId
  readonly model: ModelRef
  readonly prompt: string
  /** Resume an existing provider session (topic thread). */
  readonly sessionId?: string
  /** Working directory for coding work. */
  readonly cwd?: string
  readonly systemPrompt?: string
  /**
   * "agent" (default): full agent with tools. "utility": a single tool-less turn
   * with only `systemPrompt` as instructions — fast and cheap, for routing,
   * filing and summaries.
   */
  readonly mode?: "agent" | "utility"
  /**
   * Images shown with the prompt. Claude reads `data` (base64); Codex reads the file at `path`,
   * so images without one are Claude-only.
   */
  readonly images?: ReadonlyArray<{
    readonly mediaType: ImageMediaType
    readonly data: string
    readonly path?: string
  }>
  /** Domo's MCP server for this run (UI components, later delegation). Agent mode only. */
  readonly mcp?: { readonly url: string; readonly headers: Readonly<Record<string, string>> }
  /**
   * Whether the user approved a guarded action (see guard.ts) during this run.
   * Without it, every guarded action is refused.
   */
  readonly isApproved?: (action: string) => boolean
}

export class ProviderError extends Schema.TaggedError<ProviderError>()("ProviderError", {
  provider: Schema.String,
  message: Schema.String,
}) {}

/**
 * One interface over both SDKs. Every adapter normalizes into `AgentEvent`, so
 * the Conductor, the UI and the Lab never see provider-specific shapes.
 */
export class Providers extends Context.Service<
  Providers,
  {
    run(request: RunRequest): Stream.Stream<AgentEvent, ProviderError>
  }
>()("domo/providers/Providers") {}
