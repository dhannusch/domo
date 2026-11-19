import { Effect } from "effect"

/**
 * A minimal Streamable-HTTP MCP client for the echo provider, so end-to-end
 * tests exercise Domo's real MCP endpoint (run header, tools, live UI update)
 * exactly as a model's tool call would.
 */
export const callDomoTool = (
  mcp: { readonly url: string; readonly headers: Readonly<Record<string, string>> },
  tool: string,
  args: unknown,
) =>
  Effect.tryPromise({
    try: async () => {
      const base = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...mcp.headers,
      }
      const post = (body: unknown, extra: Record<string, string> = {}) =>
        fetch(mcp.url, {
          method: "POST",
          headers: { ...base, ...extra },
          body: JSON.stringify(body),
        })

      const init = await post({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "echo", version: "0" },
        },
      })
      const session = init.headers.get("mcp-session-id")
      await init.text()
      const sessionHeaders: Record<string, string> =
        session === null ? {} : { "mcp-session-id": session }
      await (
        await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionHeaders)
      ).text()
      const result = await post(
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } },
        sessionHeaders,
      )
      return await result.text()
    },
    catch: (cause) => new Error(`echo MCP call failed: ${String(cause)}`),
  })
