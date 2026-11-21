import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const init = join(root, "skills", "brand-foundation", "scripts", "init-brand-pack.mjs")
const validate = join(root, "skills", "brand-foundation", "scripts", "validate-brand-pack.mjs")
const sheet = join(root, "skills", "brand-foundation", "scripts", "make-contact-sheet.mjs")
const book = join(root, "skills", "brand-foundation", "scripts", "build-brand-book.mjs")

const run = (script: string, args: ReadonlyArray<string>) =>
  new Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
      })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on("error", reject)
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }))
    },
  )

describe("brand pack scripts", () => {
  it("initializes, validates, previews, and builds a pack without overwriting it", async () => {
    const home = await mkdtemp(join(tmpdir(), "domo-brand-pack-"))
    try {
      const first = await run(init, [home])
      expect(first.code).toBe(0)
      const foundation = join(home, "foundation.md")
      await writeFile(foundation, "# Chosen foundation\n")
      expect((await run(init, [home])).code).toBe(0)
      expect(await readFile(foundation, "utf8")).toBe("# Chosen foundation\n")

      await writeFile(
        join(home, "logos", "sample.svg"),
        '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>\n',
      )
      expect((await run(validate, [home])).code).toBe(0)
      const contact = join(home, "previews", "contact-sheet.html")
      expect((await run(sheet, [home, contact])).code).toBe(0)
      expect(await readFile(contact, "utf8")).toContain("sample.svg")
      const brandBook = join(home, "brand-book.html")
      expect((await run(book, [home, brandBook])).code).toBe(0)
      expect(await readFile(brandBook, "utf8")).toContain("Chosen foundation")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it("rejects malformed pack JSON and unsafe SVG references", async () => {
    const home = await mkdtemp(join(tmpdir(), "domo-brand-pack-invalid-"))
    try {
      expect((await run(init, [home])).code).toBe(0)
      await writeFile(join(home, "claims.json"), "not json\n")
      expect((await run(validate, [home])).code).toBe(1)
      await writeFile(join(home, "claims.json"), '{"version":1,"claims":[]}\n')
      await writeFile(
        join(home, "logos", "unsafe.svg"),
        '<svg viewBox="0 0 10 10"><image href="https://example.com/a.png"/></svg>\n',
      )
      expect((await run(validate, [home])).code).toBe(1)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
