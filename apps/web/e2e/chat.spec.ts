import { expect, type Page, test } from "@playwright/test"

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
  // Unique per project: the desktop and phone runs share one daemon.
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
  await expect(page.getByTestId("reply-chip")).toContainText("“")
  await send(page, "what about this part?")
  await expect(page.getByTestId("message-quote").last()).toContainText("quotable")
})

test("long unrequested answers lead with the answer and fold the rest", async ({ page }) => {
  // Both projects share one daemon: wait for this test's answer, not an earlier one from history.
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
