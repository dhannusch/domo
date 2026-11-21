#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const [targetArg, outputArg] = process.argv.slice(2)
if (targetArg === undefined) {
  console.error("Usage: make-contact-sheet.mjs <brand-pack-directory> [output.html]")
  process.exitCode = 2
} else {
  const target = resolve(targetArg)
  const output = resolve(outputArg ?? join(target, "previews", "contact-sheet.html"))
  const files = (await readdir(join(target, "logos")))
    .filter((file) => file.endsWith(".svg"))
    .sort()
  const concepts = []
  for (const file of files) {
    const svg = await readFile(join(target, "logos", file), "utf8")
    concepts.push({ file, svg: svg.replace(/<svg\b/, '<svg aria-label="Logo concept"') })
  }
  const sizes = [16, 24, 32, 64, 128, 256]
  const cards = concepts
    .map(
      ({ file, svg }) =>
        `<section><h2>${escapeHtml(file)}</h2><div class="row">${sizes.map((size) => `<figure><div class="mark" style="width:${size}px;height:${size}px">${svg}</div><figcaption>${size}px</figcaption></figure>`).join("")}</div><div class="row dark">${sizes.map((size) => `<figure><div class="mark" style="width:${size}px;height:${size}px">${svg}</div><figcaption>${size}px</figcaption></figure>`).join("")}</div></section>`,
    )
    .join("\n")
  const html = `<!doctype html><meta charset="utf-8"><title>Brand logo contact sheet</title><style>body{margin:0;padding:32px;background:#f3f2ed;color:#202422;font:16px system-ui,sans-serif}section{margin:0 0 32px;padding:24px;border:1px solid #c9cbc4;background:#fff}h1,h2{margin:0 0 16px}.row{display:flex;gap:24px;align-items:end;flex-wrap:wrap;padding:16px 0}.dark{background:#202422;color:#f3f2ed;padding:24px}.mark{display:grid;place-items:center}.mark svg{width:100%;height:100%;display:block}figure{margin:0;text-align:center}figcaption{margin-top:8px;font-size:12px}</style><h1>Brand logo contact sheet</h1>${cards || "<p>No SVG logos found.</p>"}`
  await writeFile(output, html)
  console.log(`Contact sheet ready: ${output}`)
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
