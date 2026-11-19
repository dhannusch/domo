// Regenerates the README screenshots from the fictional demo conversation:
// `bun run screenshots` (needs Google Chrome). Nothing personal is ever captured.
import { spawn } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, type Page } from "playwright-core"

const ROOT = join(import.meta.dirname, "../..")
const OUT = join(ROOT, "docs/images")
const PORT = 7460
const home = mkdtempSync(join(tmpdir(), "domo-demo-"))

const run = (args: Array<string>, env: Record<string, string> = {}) =>
  spawn(process.execPath, ["--no-warnings", ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
  })

await new Promise<void>((resolve, reject) =>
  run(["scripts/demo/seed.ts", home]).on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`seed exited ${code}`)),
  ),
)

const daemon = run(
  ["apps/daemon/src/bin/domo.ts", "--home", home, "--port", String(PORT), "serve"],
  {
    DOMO_PROVIDER: "echo",
    DOMO_TOKEN: "off",
    DOMO_VISUAL_CHECK: "off",
  },
)

const url = `http://127.0.0.1:${PORT}/`
for (let i = 0; i < 60; i++) {
  if (
    await fetch(url).then(
      (r) => r.ok,
      () => false,
    )
  )
    break
  await new Promise((r) => setTimeout(r, 250))
}

const browser = await chromium.launch({ channel: "chrome", headless: true })

const open = async (width: number, height: number, scheme: "light" | "dark", scale: number) => {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    deviceScaleFactor: scale,
    hasTouch: width < 600,
    isMobile: width < 600,
  })
  const page = await context.newPage()
  await page.goto(url)
  await page.getByTestId("composer-input").waitFor()
  await page.waitForTimeout(1200)
  return page
}

const scrollTo = async (page: Page, testId: string) => {
  await page.getByTestId(testId).last().scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -140))
  await page.waitForTimeout(600)
}

try {
  const desktop = await open(1280, 860, "light", 2)
  await page_top(desktop)
  await desktop.screenshot({ path: join(OUT, "desktop.png") })

  const phone = await open(390, 844, "dark", 3)
  await scrollTo(phone, "visual")
  await phone.screenshot({ path: join(OUT, "phone.png") })

  const settings = desktop
  await settings.getByTestId("settings-open").click()
  await settings.getByTestId("settings").waitFor()
  await settings.waitForTimeout(600)
  await settings.screenshot({ path: join(OUT, "settings.png") })
} finally {
  await browser.close()
  daemon.kill()
}

async function page_top(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
}
