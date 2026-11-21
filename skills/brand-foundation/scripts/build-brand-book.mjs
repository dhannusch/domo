#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const [targetArg, outputArg] = process.argv.slice(2)
if (targetArg === undefined) {
  console.error("Usage: build-brand-book.mjs <brand-pack-directory> [output.html]")
  process.exitCode = 2
} else {
  const target = resolve(targetArg)
  const output = resolve(outputArg ?? join(target, "brand-book.html"))
  const [foundation, voice, messages, graphic, tokens] = await Promise.all([
    readFile(join(target, "foundation.md"), "utf8"),
    readFile(join(target, "voice.md"), "utf8"),
    readFile(join(target, "messages.md"), "utf8"),
    readFile(join(target, "graphic-language.md"), "utf8"),
    readFile(join(target, "tokens.json"), "utf8"),
  ])
  const parsedTokens = JSON.parse(tokens)
  const colors = Object.entries(parsedTokens.color ?? {})
    .flatMap(([group, values]) =>
      typeof values === "object" && values !== null
        ? Object.entries(values).map(
            ([name, value]) =>
              `<li><span class="swatch" style="background:${escapeAttribute(String(value))}"></span><code>${escapeHtml(group)}.${escapeHtml(name)}</code> ${escapeHtml(String(value))}</li>`,
          )
        : [],
    )
    .join("")
  const sections = [
    ["Foundation", foundation],
    ["Voice and tone", voice],
    ["Messages", messages],
    ["Graphic language", graphic],
  ]
    .map(([title, body]) => `<section><h2>${title}</h2><pre>${escapeHtml(body)}</pre></section>`)
    .join("\n")
  await mkdir(join(target, "applications"), { recursive: true })
  await writeFile(
    output,
    `<!doctype html><meta charset="utf-8"><title>Brand book</title><style>:root{color-scheme:light}body{margin:0;padding:40px;max-width:960px;background:#f5f3ed;color:#202422;font:16px/1.5 system-ui,sans-serif}h1{font:700 48px/1.05 Georgia,serif}section{margin:24px 0;padding:24px;background:#fff;border:1px solid #c9cbc4}pre{white-space:pre-wrap;font:inherit;margin:0}.swatches{display:flex;gap:16px;flex-wrap:wrap}.swatch{display:inline-block;width:24px;height:24px;border:1px solid #202422;vertical-align:middle;margin-right:8px}</style><h1>Brand book</h1><section><h2>Color tokens</h2><ul>${colors || "<li>No colors selected yet.</li>"}</ul></section>${sections}`,
  )
  console.log(`Brand book ready: ${output}`)
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
