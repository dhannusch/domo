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
