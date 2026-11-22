import { Schema } from "effect"
import { expect, test } from "./fixtures.ts"

const Manifest = Schema.Struct({
  name: Schema.String,
  start_url: Schema.String,
  scope: Schema.String,
  icons: Schema.Array(
    Schema.Struct({
      src: Schema.String,
      sizes: Schema.String,
      type: Schema.String,
      purpose: Schema.optionalKey(Schema.String),
    }),
  ),
})

test("PWA updates expose new icon URLs while preserving the installed app identity", async ({
  page,
  request,
}) => {
  await page.goto("/")
  // UX-09: the phone still opens directly to the usable chat; no update modal is added.
  await expect(page.getByTestId("composer-input")).toBeVisible()
  const response = await request.get("/manifest.webmanifest")
  expect(response.headers()["cache-control"]).toBe("no-cache")
  const manifest = Schema.decodeUnknownSync(Manifest)(await response.json())
  expect(manifest.name).toBe("Domo")
  expect(manifest.start_url).toBe("/")
  expect(manifest.scope).toBe("/")
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512", "512x512"])
  const version = manifest.icons[0]?.src.match(/-([a-f0-9]{10})\.png$/)?.[1]
  expect(version).toMatch(/^[a-f0-9]{10}$/)
  for (const icon of manifest.icons) {
    expect(icon.src).toContain(`-${version}.png`)
    const image = await request.get(icon.src)
    expect(image.ok()).toBe(true)
    expect(image.headers()["content-type"]).toContain("image/png")
    const bytes = await image.body()
    const png = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect([png.getUint32(16), png.getUint32(20)]).toEqual(icon.sizes.split("x").map(Number))
  }
  expect(manifest.icons[2]?.purpose).toBe("maskable")
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")
  expect(touch).toBe(`/icons/apple-touch-icon-${version}.png`)
  expect((await request.get(touch ?? "")).ok()).toBe(true)
  await expect(page.locator('link[rel="icon"][type="image/png"]')).toHaveAttribute(
    "href",
    `/icons/favicon-32-${version}.png`,
  )
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    "href",
    `/icons/favicon-${version}.svg`,
  )
  const worker = await request.get("/sw.js")
  expect(worker.headers()["cache-control"]).toBe("no-cache")
  expect(await worker.text()).toContain(`icon: "/icons/icon-192-${version}.png"`)
  expect(await worker.text()).toContain(`badge: "/icons/badge-96-${version}.png"`)
})

test("the new d has an open counter, mask-safe opaque app tiles, and a dark-mode favicon", async ({
  page,
  request,
}) => {
  await page.goto("/")
  const response = await request.get("/manifest.webmanifest")
  const manifest = Schema.decodeUnknownSync(Manifest)(await response.json())
  const src = manifest.icons.find((icon) => icon.purpose === "maskable")?.src ?? ""
  const pixels = await page.evaluate(async (url) => {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext("2d")
    if (context === null) return null
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, 512, 512).data
    const pixel = (x: number, y: number) =>
      Array.from(data.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 4))
    let outside = 0
    let ink = 0
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4
        if ((data[i] ?? 255) < 100) {
          ink++
          if (Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > 512 * 0.4) outside++
        }
      }
    return { corner: pixel(0, 0), counter: pixel(252, 290), stem: pixel(360, 148), outside, ink }
  }, src)
  expect(pixels?.corner).toEqual([245, 245, 245, 255])
  expect(pixels?.counter).toEqual([245, 245, 245, 255])
  expect(pixels?.stem).toEqual([41, 41, 41, 255])
  expect(pixels?.ink).toBeGreaterThan(10_000)
  expect(pixels?.outside).toBe(0)
  const svg = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href")
  await page.goto(svg ?? "/")
  await page.emulateMedia({ colorScheme: "light" })
  await expect(page.locator("path")).toHaveCSS("fill", "rgb(41, 41, 41)")
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("path")).toHaveCSS("fill", "rgb(245, 245, 245)")
})
