import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { join } from "node:path"
import { Effect, FileSystem, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { DomoConfig } from "../config/DomoConfig.ts"

/** Paths that reach the user's data or the agent's tools; the app shell itself is public. */
const PROTECTED = ["/rpc", "/mcp", "/auth"]

const digest = (value: string) => createHash("sha256").update(value).digest()
const sameToken = (given: string, token: string) => timingSafeEqual(digest(given), digest(token))

/**
 * Whether a request may proceed. The token comes as a bearer header (agent
 * runs, the unlock check) or `?token=` (the browser's WebSocket, which can't
 * set headers). Requests outside the protected paths always pass.
 */
export const isAuthorized = (
  token: string | undefined,
  url: string,
  headers: Readonly<Record<string, string | undefined>>,
): boolean => {
  if (token === undefined) return true
  const parsed = new URL(url, "http://domo")
  if (!PROTECTED.some((p) => parsed.pathname === p || parsed.pathname.startsWith(`${p}/`)))
    return true
  const bearer = /^Bearer (.+)$/.exec(headers.authorization ?? "")?.[1]
  const given = bearer ?? parsed.searchParams.get("token") ?? ""
  return given.length > 0 && sameToken(given, token)
}

/** The daemon's access token from `<home>/token`, created (owner-only) on first use. */
export const loadToken = Effect.fn("access.loadToken")(function* (home: string) {
  const fs = yield* FileSystem.FileSystem
  const path = join(home, "token")
  const existing = yield* fs.readFileString(path).pipe(Effect.option)
  if (existing._tag === "Some" && existing.value.trim().length > 0) return existing.value.trim()
  const token = randomBytes(20).toString("base64url")
  yield* fs.makeDirectory(home, { recursive: true })
  yield* fs.writeFileString(path, `${token}\n`, { mode: 0o600 })
  return token
})

/** Refuses protected paths without the token; `/auth` lets the app check its token. */
export const AccessLive = Layer.unwrap(
  Effect.gen(function* () {
    const { token } = yield* DomoConfig
    const guard = HttpRouter.middleware(
      (app) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          if (!isAuthorized(token, request.url, request.headers))
            return HttpServerResponse.text("Unauthorized", { status: 401 })
          return yield* app
        }),
      { global: true },
    )
    return Layer.mergeAll(
      guard,
      HttpRouter.add("GET", "/auth", HttpServerResponse.empty({ status: 204 })),
    )
  }),
)
