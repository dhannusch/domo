import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
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
