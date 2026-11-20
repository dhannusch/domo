import { expect, type Page, test } from "./fixtures.ts"

const send = async (page: Page, text: string) => {
  await page.getByTestId("composer-input").fill(text)
  await page.getByTestId("composer-send").click()
}

/** The reply to the message we just sent (a worker's tests share its daemon). */
const newestReply = async (page: Page, directive: string) => {
  const replies = page.getByTestId("message-agent").filter({ hasText: directive })
  const before = await replies.count()
  await send(page, `${directive} ${Date.now()}`)
  await expect(replies).toHaveCount(before + 1)
  const reply = replies.nth(before)
  await expect(reply).toHaveAttribute("data-status", "done")
  return reply
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("composer-input")).toBeVisible()
})

test("Questions: answer inline, blanks are skipped, and the answers send as one message", async ({
  page,
}) => {
  const reply = await newestReply(page, "[[questions]]")
  const card = reply.getByTestId("questions")
  await expect(card.getByTestId("questions-answer")).toHaveCount(2)
  await expect(page.getByTestId("needs-you")).toContainText("needs you")
  // Nothing typed yet: it asks for at least one answer instead of sending.
  await card.getByTestId("questions-send").click()
  await expect(card).toContainText("Answer at least one first.")
  const said = `Scattered hours ${Date.now()}`
  await card.getByTestId("questions-answer").first().fill(said)
  await card.getByTestId("questions-send").click()
  await expect(reply.getByTestId("questions-receipt")).toHaveText("Answered 1 of 2")
  const sent = page.getByTestId("message-user").filter({ hasText: said })
  await expect(sent).toContainText("How much time do you have each week?")
  await expect(sent).toContainText("(skipped)")
})

test("a Choice renders through MCP, shows in the marker, and collapses to a receipt", async ({
  page,
}) => {
  const reply = await newestReply(page, "[[choice]]")
  const choice = reply.getByTestId("choice")
  await expect(choice).toContainText("Which contractor should we book?")
  await expect(choice.getByTestId("choice-option")).toHaveCount(2)
  // UX-07: an unanswered decision shows in the needs-you marker.
  await expect(page.getByTestId("needs-you")).toContainText("needs you")

  await choice.getByTestId("choice-option").filter({ hasText: "Hale & Co." }).click()
  await expect(reply.getByTestId("choice-receipt")).toContainText("Chose Hale & Co.")
  // The answer continues the conversation.
  await expect(
    page.getByTestId("message-user").filter({ hasText: "Hale & Co." }).last(),
  ).toBeVisible()
})

test("UX-07: the marker lists a decision that scrolled away and jumps back to it", async ({
  page,
}) => {
  // The decision lives in its own topic; the conversation then carries on in another.
  const anchor = await newestReply(page, "anchor")
  const decision = await newestReply(page, `[[topic:Quotes ${Date.now()}]] [[choice]]`)
  await expect(decision.getByTestId("refiled")).toBeVisible()
  const longAnswers = page.getByTestId("message-agent").filter({ hasText: "Short answer" })
  for (let i = 0; i < 3; i++) {
    const before = await longAnswers.count()
    await anchor.getByTestId("reply").click()
    await send(page, `filler ${i} [[long]]`)
    await expect(longAnswers).toHaveCount(before + 1)
  }
  await expect(decision.getByTestId("choice")).toBeVisible()
  await page.getByTestId("needs-you").click()
  await page.getByTestId("needs-you-list").getByRole("button").last().click()
  await expect(page.getByTestId("choice").last()).toBeInViewport()
})

test("writing something new instead of choosing closes the card as moved on", async ({ page }) => {
  const reply = await newestReply(page, "[[choice]]")
  await expect(page.getByTestId("needs-you")).toContainText("needs you")
  await send(page, `something else entirely ${Date.now()}`)
  await expect(reply.getByTestId("choice-receipt")).toHaveText("You moved on without choosing")
  await expect(page.getByTestId("needs-you")).toHaveCount(0)
})

test("answering in your own words resolves the Choice as free text", async ({ page }) => {
  const reply = await newestReply(page, "[[choice]]")
  await reply.getByTestId("choice-other").click()
  await expect(page.getByTestId("reply-chip")).toBeVisible()
  await send(page, "Neither, let's wait until spring")
  await expect(reply.getByTestId("choice-receipt")).toContainText(
    "Neither, let's wait until spring",
  )
})

test("a Comparison renders, and stacks on a phone", async ({ page }, info) => {
  const reply = await newestReply(page, "[[comparison]]")
  const comparison = reply.getByTestId("comparison")
  await expect(comparison).toContainText("Hale & Co.")
  await expect(comparison).toContainText("Recommended")
  const header = comparison.locator("thead")
  if (info.project.name === "phone") await expect(header).toBeHidden()
  else await expect(header).toBeVisible()
})

test("a Checklist can be ticked and stays ticked after reload", async ({ page }) => {
  const reply = await newestReply(page, "[[checklist]]")
  const items = reply.getByTestId("checklist-item")
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toBeChecked()
  await items.nth(1).check()
  await expect(items.nth(1)).toBeChecked()
  await page.reload()
  const reloaded = page.getByTestId("checklist").last().getByTestId("checklist-item")
  await expect(reloaded.nth(1)).toBeChecked()
})

test("a Visual runs sandboxed, executes its script, and grows to fit (UX-13)", async ({ page }) => {
  const reply = await newestReply(page, "[[visual]]")
  const frame = reply.getByTestId("visual-frame")
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts")
  await expect(frame).toHaveAttribute("title", "How a turn flows")
  await expect(
    page.frameLocator('[data-testid="visual-frame"]').last().locator("#note"),
  ).toHaveText("Scripts run.")
  // An opaque origin: the page can't reach into the frame, and the frame can't reach Domo.
  expect(await frame.evaluate((el) => (el as HTMLIFrameElement).contentDocument)).toBeNull()
  // Sized to its content, not left at the 160px placeholder.
  await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(300)
  await expect(reply.getByText("Three steps: your message")).toBeAttached()
})

test("work shows a receipt, and view reveals the tools behind it", async ({ page }) => {
  const reply = await newestReply(page, "[[work]]")
  const receipt = reply.getByTestId("work-receipt")
  await expect(receipt).toContainText("Ran 2 tools, edited 1 file")
  await receipt.getByTestId("work-view").click()
  await expect(reply.getByTestId("run-detail")).toContainText("12 tests passed")
  await expect(reply.getByTestId("run-detail")).toContainText("/project/a.ts")
})

test("UX-03: at most one component per agent message", async ({ page }) => {
  await newestReply(page, "[[choice]]")
  const articles = page.getByTestId("message-agent")
  const count = await articles.count()
  for (let i = 0; i < count; i++) {
    const components = await articles
      .nth(i)
      .locator("[data-testid=choice], [data-testid=comparison], [data-testid=checklist]")
      .count()
    expect(components).toBeLessThanOrEqual(1)
  }
})
