import { mkdtempSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { isAuthorized, loadToken } from "../src/http/access.ts"

describe("access", () => {
  const token = "s3cret"
  it("leaves the app shell public and guards the API", () => {
    expect(isAuthorized(token, "/", {})).toBe(true)
    expect(isAuthorized(token, "/assets/index.js", {})).toBe(true)
    expect(isAuthorized(token, "/rpc", {})).toBe(false)
    expect(isAuthorized(token, "/mcp", { authorization: "Bearer wrong" })).toBe(false)
    expect(isAuthorized(token, "/auth?token=", {})).toBe(false)
    // Attached images are private too.
    expect(isAuthorized(token, "/images", {})).toBe(false)
    expect(isAuthorized(token, "/images/abc", {})).toBe(false)
    expect(isAuthorized(token, `/images/abc?token=${token}`, {})).toBe(true)
  })

  it("accepts the token as a bearer header or a query parameter", () => {
    expect(isAuthorized(token, "/mcp", { authorization: `Bearer ${token}` })).toBe(true)
    expect(isAuthorized(token, `/rpc?token=${token}`, {})).toBe(true)
  })

  it("lets in your own Tailscale login without a token, and nobody else's", () => {
    const owner = ["you@example.com"]
    expect(isAuthorized(token, "/rpc", { "tailscale-user-login": "you@example.com" }, owner)).toBe(
      true,
    )
    expect(isAuthorized(token, "/rpc", { "tailscale-user-login": "You@Example.com" }, owner)).toBe(
      true,
    )
    expect(
      isAuthorized(token, "/rpc", { "tailscale-user-login": "guest@example.com" }, owner),
    ).toBe(false)
    expect(isAuthorized(token, "/rpc", { "tailscale-user-login": "you@example.com" }, [])).toBe(
      false,
    )
  })

  it("is open when the daemon has no token", () => {
    expect(isAuthorized(undefined, "/rpc", {})).toBe(true)
  })

  it.effect("creates an owner-only token once and keeps it", () => {
    const home = mkdtempSync(join(tmpdir(), "domo-access-"))
    return Effect.gen(function* () {
      const first = yield* loadToken(home)
      expect(first.length).toBeGreaterThan(20)
      expect(yield* loadToken(home)).toBe(first)
      expect(statSync(join(home, "token")).mode & 0o777).toBe(0o600)
    }).pipe(Effect.provide(NodeFileSystem.layer))
  })
})
