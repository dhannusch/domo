// Rasterize the approved SVG masters; needs the same Chrome used by screenshots/visual checks.
// Generated assets are committed, so `domo update` needs no browser to build the web app.
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { chromium } from "playwright-core"

const WEB = join(import.meta.dirname, "../apps/web")
const PUBLIC = join(WEB, "public")
const ICONS = join(PUBLIC, "icons")
const mark = readFileSync(join(ICONS, "domo.svg"), "utf8")
const favicon = readFileSync(join(ICONS, "favicon.svg"), "utf8")
const app = mark.replace(
  "<title>Domo</title>",
  '<title>Domo</title><path fill="#f5f5f5" d="M0 0h256v256H0z"/>',
)
const badge = mark.replaceAll("#292929", "#ffffff")
const version = createHash("sha256")
  .update(app)
  .update(favicon)
  .update(badge)
  .digest("hex")
  .slice(0, 10)

// Playwright is a rendering-adapter edge, like scripts/demo/screenshots.ts.
const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  const context = await browser.newContext({ deviceScaleFactor: 1, colorScheme: "light" })
  const page = await context.newPage()
  const outputs: ReadonlyArray<readonly [string, number, string, string]> = [
    ["icon-192", 192, app, "icon-192.png"],
    ["icon-512", 512, app, "icon-512.png"],
    ["icon-maskable-512", 512, app, "icon-maskable-512.png"],
    ["apple-touch-icon", 180, app, "apple-touch-icon.png"],
    ["favicon-16", 16, favicon, "favicon-16.png"],
    ["favicon-32", 32, favicon, "favicon-32.png"],
    ["badge-96", 96, badge, "badge-96.png"],
  ]
  for (const [name, size, svg, alias] of outputs) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`,
    )
    await page.locator("img").evaluate((image: HTMLImageElement) => image.decode())
    const png = await page.screenshot({ omitBackground: true })
    writeFileSync(join(ICONS, `${name}-${version}.png`), png)
    // Old pages and notification workers can still use the original URLs.
    writeFileSync(join(ICONS, alias), png)
  }
} finally {
  await browser.close()
}
writeFileSync(join(ICONS, `favicon-${version}.svg`), favicon)
writeFileSync(join(ICONS, "app.svg"), app)

// Preserve every other manifest field: the app's identity/start URL must stay stable.
const manifestPath = join(PUBLIC, "manifest.webmanifest")
const manifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
)(readFileSync(manifestPath, "utf8"))
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      ...manifest,
      icons: [
        { src: `/icons/icon-192-${version}.png`, sizes: "192x192", type: "image/png" },
        { src: `/icons/icon-512-${version}.png`, sizes: "512x512", type: "image/png" },
        {
          src: `/icons/icon-maskable-512-${version}.png`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  )}\n`,
)
const htmlPath = join(WEB, "index.html")
const html = readFileSync(htmlPath, "utf8")
  .replace(/ {4}<link rel="icon"[^>]*>\n/g, "")
  .replace(
    / {4}<link rel="apple-touch-icon"[^>]*>/,
    `    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32-${version}.png" />\n` +
      `    <link rel="icon" type="image/svg+xml" sizes="any" href="/icons/favicon-${version}.svg" />\n` +
      `    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-${version}.png" />`,
  )
writeFileSync(htmlPath, html)
const workerPath = join(PUBLIC, "sw.js")
writeFileSync(
  workerPath,
  readFileSync(workerPath, "utf8")
    .replace(/icon: "\/icons\/[^"]+"/, `icon: "/icons/icon-192-${version}.png"`)
    .replace(/badge: "\/icons\/[^"]+"/, `badge: "/icons/badge-96-${version}.png"`),
)
console.log(
  `Generated Domo icons (${version}); updated manifest, favicon, touch icon and notifications.`,
)
