#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const [targetArg] = process.argv.slice(2)
const required = [
  "foundation.md",
  "voice.md",
  "messages.md",
  "graphic-language.md",
  "decisions.md",
  "provenance.md",
  "claims.json",
  "tokens.json",
  "manifest.json",
]

const fail = (message) => {
  console.error(`Brand pack invalid: ${message}`)
  process.exitCode = 1
}

if (targetArg === undefined) {
  fail("Usage: validate-brand-pack.mjs <brand-pack-directory>")
} else {
  const target = resolve(targetArg)
  const missing = []
  for (const file of required) {
    try {
      await readFile(join(target, file), "utf8")
    } catch {
      missing.push(file)
    }
  }
  if (missing.length > 0) {
    fail(`missing ${missing.join(", ")}`)
  } else {
    let claims
    let tokens
    let manifest
    try {
      claims = JSON.parse(await readFile(join(target, "claims.json"), "utf8"))
      tokens = JSON.parse(await readFile(join(target, "tokens.json"), "utf8"))
      manifest = JSON.parse(await readFile(join(target, "manifest.json"), "utf8"))
    } catch (error) {
      fail(`invalid JSON (${error instanceof Error ? error.message : String(error)})`)
    }
    if (claims !== undefined && (claims.version !== 1 || !Array.isArray(claims.claims)))
      fail("claims.json needs version 1 and a claims array")
    if (
      tokens !== undefined &&
      (tokens.version !== 1 ||
        tokens.color === null ||
        typeof tokens.color !== "object" ||
        Array.isArray(tokens.color))
    )
      fail("tokens.json needs version 1 and a color object")
    if (
      manifest !== undefined &&
      (manifest.version !== 1 || manifest.assets === null || !Array.isArray(manifest.assets))
    )
      fail("manifest.json needs version 1 and an assets array")

    const logos = join(target, "logos")
    let logoFiles = []
    try {
      logoFiles = (await readdir(logos)).filter((file) => file.endsWith(".svg"))
    } catch {
      fail("missing logos directory")
    }
    for (const file of logoFiles) {
      const svg = await readFile(join(logos, file), "utf8")
      if (!/<svg\b[^>]*\bviewBox\s*=/.test(svg)) fail(`${file} has no viewBox`)
      if (/<(?:image|script)\b/i.test(svg) || /(?:href|src)\s*=\s*["']https?:/i.test(svg))
        fail(`${file} contains a disallowed external or raster reference`)
    }
    if (process.exitCode !== 1)
      console.log(`Brand pack valid: ${target} (${logoFiles.length} SVG logo files)`)
  }
}
