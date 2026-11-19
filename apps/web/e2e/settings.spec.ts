import { expect, test } from "@playwright/test"

test("the date opens settings, a change sticks, and Done closes it", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("settings")).toBeHidden()
  await page.getByTestId("settings-open").click()
  const sheet = page.getByTestId("settings")
  await expect(sheet).toBeVisible()
  await sheet.getByTestId("setting-away-1800").click()
  await expect(sheet.getByTestId("setting-away-1800")).toHaveAttribute("aria-pressed", "true")
  await sheet.getByTestId("settings-done").click()
  await expect(sheet).toBeHidden()

  await page.reload()
  await page.getByTestId("settings-open").click()
  await expect(page.getByTestId("setting-away-1800")).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("settings").getByText("This device", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("settings")).toBeHidden()
})

test("appearance: dark sticks on this device, and System follows the OS again", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/")
  await page.getByTestId("settings-open").click()
  await page.getByTestId("setting-theme-dark").click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  const paper = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--paper").trim(),
    )
  expect(await paper()).toBe("#181b19")
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.getByTestId("settings-open").click()
  await page.getByTestId("setting-theme-system").click()
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/)
  expect(await paper()).toBe("#ecede8")
})

test("the default model can be changed from settings", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("settings-open").click()
  await expect(page.getByTestId("setting-model-opus")).toHaveAttribute("aria-pressed", "true")
  await page.getByTestId("setting-model-sonnet").click()
  await expect(page.getByTestId("setting-model-sonnet")).toHaveAttribute("aria-pressed", "true")
  // Put it back: the desktop and phone runs share one daemon.
  await page.getByTestId("setting-model-opus").click()
  await expect(page.getByTestId("setting-model-opus")).toHaveAttribute("aria-pressed", "true")
})
