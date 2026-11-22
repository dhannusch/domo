import { VISUAL_THEMES, type VisualInput, visualDocument } from "@domo/domain"
import { Context, Effect, Layer, Option, Ref, Schema, Semaphore } from "effect"
import { type Browser, chromium } from "playwright-core"
import { DomoConfig } from "../config/DomoConfig.ts"
import { runModel } from "../mcp/orchestration.ts"
import { resolveModel } from "../models/registry.ts"
import { Providers } from "../providers/Providers.ts"
import { LAYOUT_CHECKS } from "./layoutChecks.ts"

/** Phone width in light, desktop width in dark: the two places a visual most often breaks. */
const VIEWS = [
  { width: 360, scheme: "light" },
  { width: 640, scheme: "dark" },
] as const

const REVIEW_INSTRUCTIONS = `You check a small diagram or explainer before a user sees it. You get screenshots at
360px (light) and 640px (dark), what it should show, and any automatic findings. Fail it only for problems a
reader would notice: overlapping or cut-off text, labels too faint or small to read, parts that are missing or
misleading, or a layout that falls apart at one of the widths. Ignore taste. Reply with JSON only:
{"ok": true|false, "problems": ["<short, specific, fixable problem>", ...]} with at most 5 problems.`

const Review = Schema.fromJsonString(
  Schema.Struct({ ok: Schema.Boolean, problems: Schema.Array(Schema.String) }),
)
const decodeReview = Schema.decodeUnknownOption(Review)
const json = (text: string) => /\{[\s\S]*\}/.exec(text)?.[0] ?? ""
const REVIEWER = resolveModel("sonnet")

/** Hard layout faults (overlap, overflow, unreadable text, script errors) and a reviewer's notes. */
export interface VisualReview {
  readonly layout: ReadonlyArray<string>
  readonly review: ReadonlyArray<string>
}

const CLEAN: VisualReview = { layout: [], review: [] }

interface Shot {
  readonly width: number
  readonly png: string
  readonly problems: ReadonlyArray<string>
}

/**
 * Looks at a visual before the user does: renders it headlessly with the same
 * frame the app uses, runs layout checks, and has a Claude model review the
 * screenshots. Returns the problems to fix (none if it's fine, or if no
 * browser is available — the check is best effort and never blocks a reply).
 */
export class VisualCheck extends Context.Service<
  VisualCheck,
  {
    review(visual: typeof VisualInput.Type): Effect.Effect<VisualReview>
    /**
     * A PNG of a whole HTML page at this size (2x for sharpness), for mockups the user should see
     * as a picture. Web fonts may load from Google Fonts; nothing else. None without Chrome.
     */
    /** Without a height, the picture is as tall as the content (no empty space below). */
    snapshot(
      html: string,
      width: number,
      height: number | undefined,
    ): Effect.Effect<Option.Option<Uint8Array>>
    /**
     * A PDF of a whole HTML page, one page per `@page` (a deck's slides). Fonts as for snapshot.
     * None without Chrome.
     */
    pdf(html: string): Effect.Effect<Option.Option<Uint8Array>>
  }
>()("domo/visual/VisualCheck") {
  static readonly layer = Layer.effect(
    VisualCheck,
    Effect.gen(function* () {
      const config = yield* DomoConfig
      const providers = yield* Providers
      const browserRef = yield* Ref.make<Option.Option<Browser>>(Option.none())
      const launching = yield* Semaphore.make(1)
      yield* Effect.addFinalizer(() =>
        Ref.get(browserRef).pipe(
          Effect.flatMap((b) =>
            Option.isSome(b)
              ? Effect.promise(() => b.value.close()).pipe(Effect.ignore)
              : Effect.void,
          ),
        ),
      )

      /** The system Chrome, launched on first use and kept for later visuals. */
      const browser = launching.withPermits(1)(
        Effect.gen(function* () {
          const existing = yield* Ref.get(browserRef)
          if (Option.isSome(existing) && existing.value.isConnected()) return existing
          const launched = yield* Effect.tryPromise(() =>
            chromium.launch({ channel: "chrome", headless: true }),
          ).pipe(
            Effect.catch(() => Effect.tryPromise(() => chromium.launch({ headless: true }))),
            Effect.map((b): Option.Option<Browser> => Option.some(b)),
            Effect.catch((error) =>
              Effect.logWarning("visual check unavailable: no Chrome", error).pipe(
                Effect.as(Option.none<Browser>()),
              ),
            ),
          )
          yield* Ref.set(browserRef, launched)
          return launched
        }),
      )

      const shoot = (b: Browser, html: string, view: (typeof VIEWS)[number]) =>
        Effect.acquireUseRelease(
          Effect.tryPromise(() =>
            b.newContext({
              viewport: { width: view.width, height: 800 },
              colorScheme: view.scheme,
            }),
          ),
          (context) =>
            Effect.tryPromise(async (): Promise<Shot> => {
              const page = await context.newPage()
              const errors: Array<string> = []
              page.on("pageerror", (error) =>
                errors.push(`Script error: ${error.message.slice(0, 120)}`),
              )
              await context.route("**/*", (route) => route.abort())
              await page.setContent(visualDocument(html, VISUAL_THEMES[view.scheme]), {
                waitUntil: "load",
                timeout: 5000,
              })
              await page.waitForTimeout(700)
              const found: unknown = await page.evaluate(LAYOUT_CHECKS)
              const png = await page.screenshot({ fullPage: true, type: "png", timeout: 5000 })
              const layout = Array.isArray(found) ? found.map(String) : []
              return {
                width: view.width,
                png: png.toString("base64"),
                problems: [...errors, ...layout].map((p) => `At ${view.width}px: ${p}`),
              }
            }),
          (context) => Effect.promise(() => context.close()).pipe(Effect.ignore),
        )

      const snapshot = Effect.fn("VisualCheck.snapshot")(function* (
        html: string,
        width: number,
        height: number | undefined,
      ) {
        const b = yield* browser
        if (Option.isNone(b)) return Option.none<Uint8Array>()
        return yield* Effect.acquireUseRelease(
          Effect.tryPromise(() =>
            b.value.newContext({
              viewport: { width, height: height ?? 800 },
              deviceScaleFactor: 2,
            }),
          ),
          (context) =>
            Effect.tryPromise(async () => {
              await context.route("**/*", (route) =>
                /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(route.request().url())
                  ? route.continue()
                  : route.abort(),
              )
              const page = await context.newPage()
              await page.setContent(html, { waitUntil: "networkidle", timeout: 10000 })
              await page.evaluate(() => document.fonts.ready)
              if (height === undefined) {
                // Fit the content: the lowest element's bottom, plus the body's bottom margin.
                const bottom = await page.evaluate(() => {
                  let max = 0
                  for (const element of document.body.querySelectorAll("*"))
                    max = Math.max(max, element.getBoundingClientRect().bottom)
                  const margin = Number.parseFloat(getComputedStyle(document.body).marginBottom)
                  return Math.ceil(max + (Number.isFinite(margin) ? margin : 0))
                })
                await page.setViewportSize({ width, height: Math.min(Math.max(bottom, 100), 4000) })
              }
              const png = await page.screenshot({ type: "png", timeout: 10000 })
              return Option.some(new Uint8Array(png))
            }),
          (context) => Effect.promise(() => context.close()).pipe(Effect.ignore),
        ).pipe(
          Effect.catch((error) =>
            Effect.logWarning("snapshot failed", error).pipe(Effect.as(Option.none<Uint8Array>())),
          ),
        )
      })

      const pdf = Effect.fn("VisualCheck.pdf")(function* (html: string) {
        const b = yield* browser
        if (Option.isNone(b)) return Option.none<Uint8Array>()
        return yield* Effect.acquireUseRelease(
          Effect.tryPromise(() => b.value.newContext()),
          (context) =>
            Effect.tryPromise(async () => {
              await context.route("**/*", (route) =>
                /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(route.request().url())
                  ? route.continue()
                  : route.abort(),
              )
              const page = await context.newPage()
              await page.setContent(html, { waitUntil: "networkidle", timeout: 15000 })
              await page.evaluate(() => document.fonts.ready)
              const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true })
              return Option.some(new Uint8Array(bytes))
            }),
          (context) => Effect.promise(() => context.close()).pipe(Effect.ignore),
        ).pipe(
          Effect.catch((error) =>
            Effect.logWarning("pdf failed", error).pipe(Effect.as(Option.none<Uint8Array>())),
          ),
        )
      })

      const review = Effect.fn("VisualCheck.review")(
        function* (visual: typeof VisualInput.Type) {
          if (!config.visualCheck) return CLEAN
          const b = yield* browser
          if (Option.isNone(b)) return CLEAN
          const shots = yield* Effect.forEach(VIEWS, (view) => shoot(b.value, visual.html, view))
          const automatic = shots.flatMap((s) => s.problems)
          if (REVIEWER === undefined) return { layout: automatic, review: [] }
          const verdict = yield* runModel(
            providers,
            REVIEWER,
            [
              `Visual check: ${visual.title}`,
              `It should show: ${visual.summary}`,
              automatic.length > 0
                ? `Automatic findings:\n${automatic.map((p) => `- ${p}`).join("\n")}`
                : "Automatic findings: none",
            ].join("\n\n"),
            {
              mode: "utility",
              systemPrompt: REVIEW_INSTRUCTIONS,
              images: shots.map((s) => ({ mediaType: "image/png" as const, data: s.png })),
            },
          )
          const judged = Option.getOrUndefined(decodeReview(json(verdict.text)))
          if (judged === undefined || judged.ok) return { layout: automatic, review: [] }
          return { layout: automatic, review: judged.problems.slice(0, 5) }
        },
        // Best effort: a broken check never stops the visual from being shown.
        Effect.timeout("90 seconds"),
        Effect.catchCause((cause) =>
          Effect.logWarning("visual check skipped", cause).pipe(Effect.as<VisualReview>(CLEAN)),
        ),
      )

      return VisualCheck.of({ review, snapshot, pdf })
    }),
  )

  static readonly layerNoop = Layer.succeed(
    VisualCheck,
    VisualCheck.of({
      review: () => Effect.succeed(CLEAN),
      snapshot: () => Effect.succeed(Option.none()),
      pdf: () => Effect.succeed(Option.none()),
    }),
  )
}
