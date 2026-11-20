import { E2E_TOKEN } from "../playwright.config.ts"
import { expect, test } from "./fixtures.ts"

test("a device without the token sees only the unlock screen", async ({ page, request }) => {
  await page.goto("/")
  await expect(page.getByTestId("unlock")).toBeVisible()
  await expect(page.getByTestId("composer-input")).toHaveCount(0)
  expect((await request.get("/auth")).status()).toBe(401)
})

test("a wrong code is refused, the right one opens the chat", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("unlock-code").fill("nope")
  await page.getByTestId("unlock-submit").click()
  await expect(page.getByText("That code didn't work.")).toBeVisible()
  await page.getByTestId("unlock-code").fill(E2E_TOKEN)
  await page.getByTestId("unlock-submit").click()
  await expect(page.getByTestId("unlock")).toHaveCount(0)
  await expect(page.getByTestId("composer-input")).toBeVisible()
})

test("a pairing link unlocks and leaves no token in the address bar", async ({ page }) => {
  await page.goto(`/?token=${E2E_TOKEN}`)
  await expect(page.getByTestId("composer-input")).toBeVisible()
  expect(page.url()).not.toContain("token")
  await page.reload()
  await expect(page.getByTestId("composer-input")).toBeVisible()
})
