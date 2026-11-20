import { expect, test } from "./fixtures.ts"

/** A tiny real PNG (2×2), so the shrink step and the upload run for real. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGM4keUFRAwQCgArlgXxKFd8GAAAAABJRU5ErkJggg==",
  "base64",
)

test("attach an image: it uploads, shows in the message, and reaches the model", async ({
  page,
}, info) => {
  await page.goto("/")
  await page.getByTestId("composer-file").setInputFiles({
    name: "screen.png",
    mimeType: "image/png",
    buffer: PNG,
  })
  const attachment = page.getByTestId("attachment")
  await expect(attachment).toHaveAttribute("data-status", "ready")
  const said = `what is this ${info.project.name}`
  await page.getByTestId("composer-input").fill(said)
  await page.getByTestId("composer-send").click()

  const sent = page.getByTestId("message-user").filter({ hasText: said })
  const shown = sent.getByTestId("message-images").locator("img")
  await expect(shown).toHaveCount(1)
  // The image is served back (protected like the chat), so it actually renders.
  await expect.poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2)
  await expect(
    page.getByTestId("message-agent").filter({ hasText: `Echo: ${said} (saw 1 image)` }),
  ).toHaveAttribute("data-status", "done")
  await expect(page.getByTestId("attachments")).toHaveCount(0)
})

test("an image can be sent on its own, and removed before sending", async ({ page }) => {
  await page.goto("/")
  const file = { name: "a.png", mimeType: "image/png", buffer: PNG }
  await page.getByTestId("composer-file").setInputFiles([file, { ...file, name: "b.png" }])
  await expect(page.getByTestId("attachment")).toHaveCount(2)
  await page.getByTestId("attachment-remove").first().click()
  await expect(page.getByTestId("attachment")).toHaveCount(1)
  await expect(page.getByTestId("attachment")).toHaveAttribute("data-status", "ready")
  await page.getByTestId("composer-send").click()
  await expect(
    page.getByTestId("message-agent").filter({ hasText: "(saw 1 image)" }).last(),
  ).toHaveAttribute("data-status", "done")
})
