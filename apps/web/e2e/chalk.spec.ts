import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures.ts"

const send = async (page: Page, directive: string) => {
  await page.getByTestId("composer-input").fill(`${directive} chalk ${crypto.randomUUID()}`)
  await page.getByTestId("composer-send").click()
  const reply = page.getByTestId("message-agent").last()
  await expect(reply).toHaveAttribute("data-status", "done")
  return reply
}

for (const theme of ["light", "dark"] as const) {
  test(`Chalk ${theme}: readable neutral colors, touch targets and no page overflow (UX-09)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto("/")
    const reply = await send(page, "[[choice]]")
    await expect(reply.getByTestId("choice-option").first()).toContainText("Recommended")
    const colors = await page.locator("html").evaluate((element) => {
      const style = getComputedStyle(element)
      return ["--paper", "--ink", "--accent", "--pencil", "--margin-rule"].map((key) =>
        style.getPropertyValue(key).trim(),
      )
    })
    expect(colors).toEqual(
      theme === "light"
        ? ["#f5f5f5", "#292929", "#505050", "#626262", "#878787"]
        : ["#1c1c1c", "#ebebeb", "#d0d0d0", "#b9b9b9", "#959595"],
    )
    const targets = [
      page.getByTestId("settings-open"),
      page.getByTestId("composer-attach"),
      page.getByTestId("composer-send"),
      reply.getByTestId("reply"),
      reply.getByTestId("choice-other"),
      reply.getByTestId("choice-option").first(),
    ]
    for (const target of targets) {
      const box = await target.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    )
    // The control theme also reaches an already-rendered, sandboxed Visual.
    await send(page, "[[visual]]")
    await page.getByTestId("settings-open").click()
    await page.getByTestId(`setting-theme-${theme === "light" ? "dark" : "light"}`).click()
    await page.getByTestId("settings-done").click()
    const expected = theme === "light" ? "#d0d0d0" : "#505050"
    await expect
      .poll(() =>
        page
          .frameLocator('[data-testid="visual-frame"]')
          .last()
          .locator("html")
          .evaluate((el) => getComputedStyle(el).getPropertyValue("--accent").trim()),
      )
      .toBe(expected)
  })
}

test("settings and files keep Done visible and return keyboard focus (UX-09)", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("settings-open").click()
  const settings = page.getByTestId("settings")
  await expect(settings).toHaveAccessibleName("Settings")
  await page.getByTestId("profile-open").scrollIntoViewIfNeeded()
  await expect(page.getByTestId("settings-done")).toBeInViewport()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("settings-open")).toBeFocused()
  const reply = await send(page, "[[deck]]")
  await reply.getByTestId("file-card").click()
  const viewer = page.getByTestId("file-viewer")
  await expect(viewer).toHaveAccessibleName("Brand proposal")
  await expect(viewer.getByTestId("file-done")).toBeInViewport()
  await expect(viewer.getByTestId("file-open-tab")).toBeVisible()
  expect(await viewer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.keyboard.press("Escape")
  await expect(reply.getByTestId("file-card")).toBeFocused()
})

test("a multiline quoted draft leaves the end of the conversation reachable (UX-09)", async ({
  page,
}) => {
  await page.goto("/")
  const reply = await send(page, "[[long]]")
  await reply.getByTestId("reply").click()
  await page.getByTestId("composer-input").fill("One\ntwo\nthree\nfour\nfive")
  await expect(page.getByTestId("reply-chip")).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const composer = document.querySelector('[data-testid="composer"]')
        const conversation = document.querySelector(".page")
        if (composer === null || conversation === null) return false
        return (
          Number.parseFloat(getComputedStyle(conversation).paddingBottom) >=
          composer.getBoundingClientRect().height
        )
      }),
    )
    .toBe(true)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const [action, composer] = await Promise.all([
    reply.getByTestId("reply").boundingBox(),
    page.getByTestId("composer").boundingBox(),
  ])
  expect((action?.y ?? 0) + (action?.height ?? 0)).toBeLessThanOrEqual(composer?.y ?? 0)
})
