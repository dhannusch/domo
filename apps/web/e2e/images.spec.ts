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

test("Domo can show an image it made, in its reply", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("composer-input").fill(`[[attach]] show me ${Date.now()}`)
  await page.getByTestId("composer-send").click()
  const reply = page.getByTestId("message-agent").filter({ hasText: "[[attach]]" }).last()
  const shown = reply.getByTestId("message-images").locator("img")
  await expect(shown).toHaveCount(1)
  await expect.poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2)
})

test("Domo's images show large, and the work line sits below them", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("composer-input").fill(`[[work]] [[attach]] mockups ${Date.now()}`)
  await page.getByTestId("composer-send").click()
  const reply = page.getByTestId("message-agent").filter({ hasText: "mockups" }).last()
  await expect(reply).toHaveAttribute("data-status", "done")
  const image = reply.getByTestId("message-images").locator("img")
  const receipt = reply.getByTestId("work-receipt")
  const [imageBox, receiptBox, proseBox] = await Promise.all([
    image.boundingBox(),
    receipt.boundingBox(),
    reply.locator("[data-message-id]").boundingBox(),
  ])
  // Full measure, not a thumbnail.
  expect(imageBox?.width ?? 0).toBeGreaterThan((proseBox?.width ?? 0) * 0.9)
  // Nothing overlaps: the image ends above the work line.
  expect((imageBox?.y ?? 0) + (imageBox?.height ?? 0)).toBeLessThanOrEqual(receiptBox?.y ?? 0)
})

test("tapping one of Domo's images opens it in the viewer, not a new window", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("composer-input").fill(`[[attach]] look ${Date.now()}`)
  await page.getByTestId("composer-send").click()
  const reply = page.getByTestId("message-agent").filter({ hasText: "look" }).last()
  const pages = page.context().pages().length
  await reply.getByTestId("message-images").locator("img").click()
  await expect(page.getByTestId("file-viewer").locator("img")).toBeVisible()
  expect(page.context().pages().length).toBe(pages)
})

test("Domo can hand over a deck, which opens live in the viewer", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("composer-input").fill(`[[deck]] the proposal ${Date.now()}`)
  await page.getByTestId("composer-send").click()
  const reply = page.getByTestId("message-agent").filter({ hasText: "the proposal" }).last()
  const card = reply.getByTestId("file-card")
  await expect(card).toContainText("Brand proposal")
  await expect(card).toContainText("Page")
  await card.click()
  const deck = page.getByTestId("file-viewer").frameLocator("[data-testid=file-frame]")
  await expect(deck.getByRole("heading", { name: "Direction A" })).toBeVisible()
})
