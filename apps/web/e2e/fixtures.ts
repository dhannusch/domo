import { type ChildProcess, spawn } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test as base } from "@playwright/test"

export { expect } from "@playwright/test"

export interface DaemonOptions {
  /** Extra environment for this project's daemons (e.g. a short away clock, a token). */
  readonly daemonEnv: Readonly<Record<string, string>>
}

const DAEMON = join(import.meta.dirname, "../../daemon/src/bin/domo.ts")

/** A port nothing is listening on, so a daemon left over from an interrupted run can't answer. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() =>
        typeof address === "object" && address !== null
          ? resolve(address.port)
          : reject(new Error("no port")),
      )
    })
  })

const waitUntilUp = async (url: string, child: ChildProcess) => {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`daemon exited (${child.exitCode})`)
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`daemon at ${url} didn't start`)
}

/**
 * Every worker gets its own daemon (echo provider, fresh temporary home), so tests run in
 * parallel without sharing a chat, and one test's leftovers can't break another's.
 */
export const test = base.extend<DaemonOptions, { daemonUrl: string }>({
  daemonEnv: [{}, { option: true, scope: "worker" }],
  daemonUrl: [
    async ({ daemonEnv }, use) => {
      const port = await freePort()
      const home = mkdtempSync(join(tmpdir(), "domo-e2e-"))
      const child = spawn(
        process.execPath,
        ["--no-warnings", DAEMON, "--home", home, "--port", String(port), "serve"],
        {
          env: { ...process.env, DOMO_PROVIDER: "echo", DOMO_TOKEN: "off", ...daemonEnv },
          stdio: "ignore",
        },
      )
      const url = `http://127.0.0.1:${port}`
      try {
        await waitUntilUp(url, child)
        await use(url)
      } finally {
        child.kill()
      }
    },
    { scope: "worker", timeout: 30_000 },
  ],
  baseURL: async ({ daemonUrl }, use) => use(daemonUrl),
})
