import { expect, type Page, test } from "./fixtures.ts"

const send = async (page: Page, text: string) => {
  await page.getByTestId("composer-input").fill(text)
  await page.getByTestId("composer-send").click()
}

const agentReply = (page: Page, text: string) =>
  page.getByTestId("message-agent").filter({ hasText: text })

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("composer-input")).toBeVisible()
})

test("sends a message and streams the reply into place", async ({ page }, info) => {
  const said = `hello from ${info.project.name}`
  await send(page, said)
  await expect(page.getByTestId("message-user").filter({ hasText: said })).toBeVisible()
  await expect(agentReply(page, `Echo: ${said}`)).toHaveAttribute("data-status", "done")
  // UX-02: completion happens in place, so the user message stays directly above its reply.
  const user = page.getByTestId("message-user").filter({ hasText: said })
  const reply = agentReply(page, `Echo: ${said}`)
  const userBox = await user.boundingBox()
  const replyBox = await reply.boundingBox()
  expect(userBox?.y ?? 0).toBeLessThan(replyBox?.y ?? 0)
})

test("renders markdown tables as tables", async ({ page }, info) => {
  await send(page, `[[table]] quotes ${info.project.name}`)
  const reply = agentReply(page, "Here are the quotes").last()
  await expect(reply.locator("table th").first()).toHaveText("Builder")
  await expect(reply.locator("table td").first()).toHaveText("Hale & Co.")
  // The table scrolls inside the message; the page itself never scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test("opens at the newest message", async ({ page }, info) => {
  for (const n of [1, 2, 3]) await send(page, `[[long]] filler ${n} ${info.project.name}`)
  await expect(page.getByTestId("message-agent").last()).toHaveAttribute("data-status", "done")
  await page.reload()
  const last = page.getByTestId("message-agent").last()
  await expect(last).toBeInViewport()
  await expect
    .poll(() =>
      page.evaluate(
        () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4,
      ),
    )
    .toBe(true)
})

test("shows a quiet hint when the filer moves an exchange to another topic", async ({
  page,
}, info) => {
  await send(page, `[[topic:Kitchen ${info.project.name}]] did the quote arrive?`)
  await expect(
    page.getByTestId("refiled").filter({ hasText: `Filed under Kitchen ${info.project.name}` }),
  ).toBeVisible()
})

test("reply-to: the Reply action shows a chip and the sent message keeps it", async ({
  page,
}, info) => {
  const said = `reply target ${info.project.name}`
  await send(page, said)
  const reply = agentReply(page, `Echo: ${said}`)
  await expect(reply).toHaveAttribute("data-status", "done")
  await reply.getByTestId("reply").click()
  await expect(page.getByTestId("reply-chip")).toContainText("Replying to")
  // Unique text: later tests on this worker share its daemon.
  await send(page, `following up ${info.project.name}`)
  await expect(page.getByTestId("reply-chip")).toHaveCount(0)
  await expect(agentReply(page, `Echo: following up ${info.project.name}`)).toBeVisible()
})

test("reply with quote: selecting text anchors the reply to the fragment", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "Text selection is driven by mouse in this test")
  const said = `quotable words here ${info.project.name}`
  await send(page, said)
  const prose = agentReply(page, `Echo: ${said}`).locator("[data-message-id]")
  await expect(prose).toContainText("quotable")
  await prose.getByText("quotable words", { exact: false }).selectText()
  await page.getByTestId("reply-with-quote").click()
  // A quote with no comment is fine: add it as is.
  await page.getByTestId("highlight-comment-add").click()
  await expect(page.getByTestId("reply-chip")).toContainText("“")
  await send(page, "what about this part?")
  await expect(page.getByTestId("message-quote").last()).toContainText("quotable")
})

test("comments on highlights: each gets its own note, and they're sent together", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "Text selection is driven by mouse in this test")
  const first = `alpha fragment ${info.project.name}`
  const second = `beta fragment ${info.project.name}`
  await send(page, first)
  await expect(agentReply(page, `Echo: ${first}`)).toHaveAttribute("data-status", "done")
  await send(page, second)
  await expect(agentReply(page, `Echo: ${second}`)).toHaveAttribute("data-status", "done")
  const highlight = async (words: string) => {
    await agentReply(page, words)
      .last()
      .locator("[data-message-id]")
      .getByText(words, { exact: false })
      .selectText()
    await page.getByTestId("reply-with-quote").click()
    await expect(page.getByTestId("highlight-comment-text")).toBeFocused()
  }
  for (const words of ["alpha fragment", "beta fragment"]) {
    await highlight(words)
    await page.getByTestId("highlight-comment-text").fill(`about ${words}`)
    await page.getByTestId("highlight-comment-text").press("Enter")
  }
  const chips = page.getByTestId("reply-chip")
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(0)).toContainText("about alpha fragment")
  await expect(chips.nth(1)).toContainText("and “")
  // Each comment can be dropped on its own, and Cancel adds nothing.
  await chips.nth(0).getByTestId("reply-cancel").click()
  await expect(chips).toHaveCount(1)
  await highlight("alpha fragment")
  await page.getByTestId("highlight-comment-text").fill("never mind")
  await page.getByTestId("highlight-comment-text").press("Escape")
  await expect(chips).toHaveCount(1)
  await highlight("alpha fragment")
  await page.getByTestId("highlight-comment-text").fill(`again ${info.project.name}`)
  await page.getByTestId("highlight-comment-add").click()
  // Comments say enough on their own: Send works with the message box empty.
  await expect(page.getByTestId("composer-input")).toHaveAttribute(
    "placeholder",
    "Anything else? (optional)",
  )
  await page.getByTestId("composer-send").click()
  const sent = page.getByTestId("message-user").filter({ hasText: `again ${info.project.name}` })
  await expect(sent.getByTestId("message-quote")).toHaveCount(2)
  await expect(sent.getByTestId("message-comment")).toHaveText([
    "about beta fragment",
    `again ${info.project.name}`,
  ])
  await expect(chips).toHaveCount(0)
})

test("long unrequested answers lead with the answer and fold the rest", async ({ page }) => {
  // A worker's tests share its daemon: wait for this test's answer, not an earlier one from history.
  const answers = agentReply(page, "Short answer: yes")
  const before = await answers.count()
  await send(page, "should we hire them? [[long]]")
  await expect(answers).toHaveCount(before + 1)
  const reply = answers.nth(before)
  await expect(reply).toHaveAttribute("data-status", "done")
  await expect(reply).not.toContainText("Detail paragraph 6")
  await reply.getByTestId("more").click()
  await expect(reply).toContainText("Detail paragraph 6")
})

test("UX-09: every action is reachable without hover", async ({ page }, info) => {
  const said = `no hover ${info.project.name}`
  await send(page, said)
  const reply = agentReply(page, `Echo: ${said}`)
  await expect(reply.getByTestId("reply")).toBeVisible()
})
