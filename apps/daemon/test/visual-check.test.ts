import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { chromium } from "playwright-core"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { VisualCheck } from "../src/visual/VisualCheck.ts"

const TestLayer = VisualCheck.layer.pipe(
  Layer.provide(layerEcho),
  Layer.provide(DomoConfig.layerFrom({ home: "/tmp/unused", port: 0, visualCheck: true })),
)

const visual = (html: string) => ({ title: "Test", summary: "A test visual", html })

/** Whether this machine (or sandbox) can start Chrome at all; without it the check is skipped by design. */
const chrome = await chromium.launch({ channel: "chrome", headless: true }).then(
  async (browser) => {
    await browser.close()
    return true
  },
  () => false,
)

/** Renders in the system Chrome, like the daemon does; slow-ish, so one browser for all cases. */
describe.skipIf(!chrome)("VisualCheck", () => {
  it.live(
    "pdf makes one page per slide of a deck",
    () =>
      Effect.gen(function* () {
        const deck =
          "<style>@page { size: 1920px 1080px; margin: 0 } body { margin: 0 } " +
          "section { height: 1080px; break-after: page }</style>" +
          "<section>One</section><section>Two</section>"
        const pdf = Option.getOrThrow(yield* (yield* VisualCheck).pdf(deck))
        const text = new TextDecoder("latin1").decode(pdf)
        expect(text.startsWith("%PDF")).toBe(true)
        expect(text.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(2)
      }).pipe(Effect.provide(TestLayer)),
    30_000,
  )

  it.live(
    "the brand deck template prints one full-size page per slide",
    () =>
      Effect.gen(function* () {
        const template = readFileSync(
          join(import.meta.dirname, "../../../skills/brand-foundation/templates/deck.html"),
          "utf8",
        )
        const pdf = Option.getOrThrow(yield* (yield* VisualCheck).pdf(template))
        const text = new TextDecoder("latin1").decode(pdf)
        expect(text.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(3)
        // 1920x1080 CSS px is 1440x810 PDF points.
        expect(text).toMatch(/MediaBox\s*\[\s*0 0 1440 810\s*\]/)
      }).pipe(Effect.provide(TestLayer)),
    30_000,
  )

  it.live(
    "snapshot turns a page into a sharp PNG of the asked size",
    () =>
      Effect.gen(function* () {
        const png = yield* (yield* VisualCheck).snapshot(
          "<body style='margin:0;background:#2f5d50'><h1 style='color:white'>How Teams Ship</h1></body>",
          400,
          300,
        )
        const bytes = Option.getOrThrow(png)
        // PNG signature, then width and height in the header (2x for sharpness).
        expect([...bytes.slice(1, 4)]).toEqual([80, 78, 71])
        const view = new DataView(bytes.buffer, bytes.byteOffset)
        expect([view.getUint32(16), view.getUint32(20)]).toEqual([800, 600])
      }).pipe(Effect.provide(TestLayer)),
    30_000,
  )

  it.live(
    "without a height, the snapshot is exactly as tall as its content",
    () =>
      Effect.gen(function* () {
        const png = yield* (yield* VisualCheck).snapshot(
          "<body style='margin:0'><div style='height:250px;background:#2f5d50'></div></body>",
          400,
          undefined,
        )
        const bytes = Option.getOrThrow(png)
        const view = new DataView(bytes.buffer, bytes.byteOffset)
        expect([view.getUint32(16), view.getUint32(20)]).toEqual([800, 500])
      }).pipe(Effect.provide(TestLayer)),
    30_000,
  )

  it.live(
    "catches overlapping labels, overflow and tiny text, and passes a clean diagram",
    () =>
      Effect.gen(function* () {
        const check = yield* VisualCheck
        const broken = yield* check.review(
          visual(
            `<div style="position:relative;height:80px"><span style="position:absolute;left:10px;top:10px">Outdoor coil</span><span style="position:absolute;left:20px;top:12px">Compressor</span></div><div style="width:900px">wide</div><p style="font-size:7px">tiny print</p>`,
          ),
        )
        expect(broken.layout.some((p) => p.includes("overlaps"))).toBe(true)
        expect(broken.layout.some((p) => p.includes("wider than the frame"))).toBe(true)
        expect(broken.layout.some((p) => p.includes("too small"))).toBe(true)

        const clean = yield* check.review(
          visual(
            `<svg viewBox="0 0 300 100" width="100%"><rect x="10" y="20" width="120" height="60" rx="8" fill="none" stroke="var(--ink)"/><text x="70" y="55" text-anchor="middle" font-size="16" fill="var(--ink)">Outside</text><rect x="170" y="20" width="120" height="60" rx="8" fill="none" stroke="var(--ink)"/><text x="230" y="55" text-anchor="middle" font-size="16" fill="var(--ink)">Inside</text></svg>`,
          ),
        )
        expect(clean).toEqual({ layout: [], review: [] })
      }).pipe(Effect.provide(TestLayer)),
    60_000,
  )
})
