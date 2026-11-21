#!/usr/bin/env node
import { access, cp, mkdir, readdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const [targetArg] = process.argv.slice(2)
if (targetArg === undefined) {
  console.error("Usage: init-brand-pack.mjs <target-directory>")
  process.exitCode = 2
} else {
  const target = resolve(targetArg)
  const template = join(dirname(fileURLToPath(import.meta.url)), "../templates/brand-pack")
  await mkdir(target, { recursive: true })
  for (const directory of ["logos", "applications", "previews"]) {
    await mkdir(join(target, directory), { recursive: true })
  }
  const entries = await readdir(template, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const destination = join(target, entry.name)
    try {
      await access(destination)
    } catch {
      await cp(join(template, entry.name), destination)
    }
  }
  const manifest = join(target, "manifest.json")
  try {
    await writeFile(manifest, `${JSON.stringify({ version: 1, assets: [] }, null, 2)}\n`, {
      flag: "wx",
    })
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
      throw error
  }
  console.log(`Brand pack ready: ${target}`)
}
