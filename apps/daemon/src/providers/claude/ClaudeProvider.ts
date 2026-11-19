import { type HookInput, query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { AgentEvent } from "@domo/domain"
import { Effect, Predicate, Stream } from "effect"
import { type AuthMode, subprocessEnv } from "../auth.ts"
import { approvalNeeded, classifyCommand } from "../guard.ts"
import { ProviderError, type RunRequest } from "../Providers.ts"
import { mapClaudeMessage } from "./mapping.ts"

/** Long enough for a council or a delegated coding task. */
const MCP_TOOL_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Guarded actions are refused before they run, whatever the session's own
 * permission settings say; everything else is allowed (high autonomy).
 */
const guardOptions = (request: RunRequest) => ({
  hooks: {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          async (input: HookInput) => {
            const command =
              input.hook_event_name === "PreToolUse" && Predicate.isObject(input.tool_input)
                ? input.tool_input.command
                : undefined
            const action = typeof command === "string" ? classifyCommand(command) : undefined
            if (action === undefined || (request.isApproved?.(action) ?? false)) return {}
            return {
              hookSpecificOutput: {
                hookEventName: "PreToolUse" as const,
                permissionDecision: "deny" as const,
                permissionDecisionReason: approvalNeeded(action, request.mcp !== undefined),
              },
            }
          },
        ],
      },
    ],
  },
  canUseTool: async (_tool: string, input: Record<string, unknown>) => ({
    behavior: "allow" as const,
    updatedInput: input,
  }),
})

/** A plain prompt, or one user message carrying images (streaming input mode). */
const promptOf = (request: RunRequest): string | AsyncIterable<SDKUserMessage> => {
  const images = request.images
  if (images === undefined || images.length === 0) return request.prompt
  const message: SDKUserMessage = {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        ...images.map((image) => ({
          type: "image" as const,
          source: { type: "base64" as const, media_type: image.mediaType, data: image.data },
        })),
        { type: "text" as const, text: request.prompt },
      ],
    },
  }
  return (async function* () {
    yield message
  })()
}

const toError = (cause: unknown) =>
  new ProviderError({
    provider: "claude",
    message: cause instanceof Error ? cause.message : String(cause),
  })

/**
 * Runs one turn on the Claude Agent SDK with the user's own Claude Code login.
 * Interrupting the stream aborts the underlying CLI process.
 */
export const makeClaudeRunner =
  (auth: AuthMode) =>
  (request: RunRequest): Stream.Stream<AgentEvent, ProviderError> =>
    Stream.suspend(() => {
      const abortController = new AbortController()
      const messages = query({
        prompt: promptOf(request),
        options: {
          model: request.model.id,
          abortController,
          includePartialMessages: true,
          // High autonomy within the project; guarded actions go through ask_user (DomoMcp).
          permissionMode: "acceptEdits",
          ...guardOptions(request),
          // Project conventions (CLAUDE.md) only — never the user's global hooks or plugins.
          settingSources: ["project"],
          // The SDK replaces the subprocess env when `env` is set; API keys are stripped in subscription mode.
          env: subprocessEnv(auth, process.env),
          systemPrompt:
            request.systemPrompt === undefined
              ? { type: "preset", preset: "claude_code" }
              : { type: "preset", preset: "claude_code", append: request.systemPrompt },
          ...(request.mcp === undefined
            ? {}
            : {
                mcpServers: {
                  domo: {
                    type: "http" as const,
                    url: request.mcp.url,
                    headers: { ...request.mcp.headers },
                    // Delegations and councils can take many minutes.
                    timeout: MCP_TOOL_TIMEOUT_MS,
                    // Domo's tools are always relevant; skip the deferred ToolSearch lookup.
                    alwaysLoad: true,
                  },
                },
                // Domo's own tools never need a permission prompt.
                allowedTools: ["mcp__domo"],
              }),
          ...(request.sessionId === undefined ? {} : { resume: request.sessionId }),
          ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
        },
      })
      return Stream.fromAsyncIterable(messages, toError).pipe(
        Stream.flatMap((message) => Stream.fromIterable(mapClaudeMessage(message, request.runId))),
        Stream.ensuring(Effect.sync(() => abortController.abort())),
      )
    })
