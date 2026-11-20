import { expect, type Page, test } from "./fixtures.ts"

const send = async (page: Page, text: string) => {
  await page.getByTestId("composer-input").fill(text)
  await page.getByTestId("composer-send").click()
}

const reply = (page: Page, text: string) =>
  page.getByTestId("message-agent").filter({ hasText: text })

/** Wait out the away clock (3s here) plus a tidy tick, without touching the page. */
const goAway = (page: Page) => page.waitForTimeout(5_000)

/** Any interaction counts as coming back. */
const comeBack = (page: Page) => page.mouse.click(5, 5)

test("tidying while away: finished topics move to Earlier, the return line says so, undo restores", async ({
  page,
}) => {
  await page.goto("/")
  await send(page, "[[topic:Kitchen]] [[resolved]] booked the contractor")
  await expect(page.getByTestId("refiled").filter({ hasText: "Kitchen" })).toBeVisible()
  await send(page, "[[topic:Taxes]] what's due this quarter?")
  await expect(reply(page, "what's due this quarter?")).toHaveAttribute("data-status", "done")
  await page.waitForTimeout(2_500) // let the read cursor report

  // UX-02 / UX-08: nothing moves while present.
  await expect(reply(page, "booked the contractor")).toBeVisible()

  await goAway(page)
  // Still nothing moves until the user comes back.
  await expect(reply(page, "booked the contractor")).toBeVisible()

  await comeBack(page)
  await expect(page.getByTestId("return-line")).toContainText("moved 1 topic to Earlier")
  await expect(reply(page, "booked the contractor")).toHaveCount(0)
  // The last touched topic stays on the page.
  await expect(reply(page, "what's due this quarter?")).toBeVisible()

  // Earlier opens like a normal chat.
  await page.getByTestId("earlier").click()
  await expect(page.getByTestId("earlier-messages")).toContainText("booked the contractor")
  await page.getByTestId("earlier").click()

  // Undo puts it back.
  await page.getByTestId("return-undo").click()
  await expect(reply(page, "booked the contractor")).toBeVisible()
  await expect(page.getByTestId("earlier")).toHaveCount(0)
})

test("a costly decision gets one confirmation, answered without a model run", async ({ page }) => {
  await page.goto("/")
  await send(page, "[[decide:Hire Hale & Co.]] let's go with Hale")
  const note = page
    .getByTestId("message-agent")
    .filter({ hasText: "Noting this as decided: Hire Hale & Co." })
  await expect(note).toBeVisible()
  const before = await page.getByTestId("message-agent").count()
  await note.getByTestId("choice-option").filter({ hasText: "That's right" }).click()
  await expect(note.getByTestId("choice-receipt")).toContainText("Chose That's right")
  await page.waitForTimeout(500)
  await expect(page.getByTestId("message-agent")).toHaveCount(before)
  // Reversible, so it can be undone (until the next tidy).
  await note.getByTestId("choice-undo").click()
  await expect(note.getByTestId("choice")).toBeVisible()
})

test("returning to an older topic shows a source tag that opens the originals", async ({
  page,
}) => {
  await page.goto("/")
  await send(page, "[[topic:Garden]] [[resolved]] planted the tulips")
  await expect(page.getByTestId("refiled").filter({ hasText: "Garden" })).toBeVisible()
  await send(page, "[[topic:Car]] [[resolved]] booked the service")
  await expect(page.getByTestId("refiled").filter({ hasText: "Car" })).toBeVisible()
  await send(page, "[[topic:Dinner]] what's for dinner?")
  await expect(reply(page, "what's for dinner?")).toHaveAttribute("data-status", "done")
  await page.waitForTimeout(2_500)
  await goAway(page)
  await comeBack(page)
  await expect(page.getByTestId("return-line")).toContainText("Earlier")

  // Reply to a folded topic from Earlier: the answer carries a source tag.
  await page.getByTestId("earlier").click()
  await page
    .getByTestId("earlier-messages")
    .getByTestId("message-agent")
    .filter({ hasText: "tulips" })
    .getByTestId("reply")
    .click()
  await send(page, "when should they bloom?")
  const pickedUp = reply(page, "when should they bloom?")
  await expect(pickedUp).toHaveAttribute("data-status", "done")
  await expect(pickedUp.getByTestId("source-tag")).toBeVisible()
  await pickedUp.getByTestId("source-view").click()
  await expect(pickedUp.getByTestId("source-detail")).toContainText("planted the tulips")
  await pickedUp.getByTestId("not-quite").click()
  await expect(page.getByTestId("reply-chip")).toContainText("what did I get wrong?")
})
