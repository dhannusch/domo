import { expect, type Page, test } from "./fixtures.ts"

const newestReply = async (page: Page, directive: string) => {
  const replies = page.getByTestId("message-agent").filter({ hasText: directive })
  const before = await replies.count()
  await page.getByTestId("composer-input").fill(`${directive} ${Date.now()}`)
  await page.getByTestId("composer-send").click()
  await expect(replies).toHaveCount(before + 1)
  const reply = replies.nth(before)
  await expect(reply).toHaveAttribute("data-status", "done")
  return reply
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("composer-input")).toBeVisible()
})

test("a delegation shows as a hand-off in the receipt, and view shows the subagent's result", async ({
  page,
}) => {
  const reply = await newestReply(page, "[[delegate]]")
  const receipt = reply.getByTestId("work-receipt")
  await expect(receipt).toContainText("Handed off to Codex")
  await receipt.getByTestId("work-view").click()
  await expect(reply.getByTestId("run-delegations")).toContainText(
    "Echo: Summarize the plan in one line",
  )
})

test("a council asks every model and view shows each member", async ({ page }) => {
  const reply = await newestReply(page, "[[council]]")
  const receipt = reply.getByTestId("work-receipt")
  await expect(receipt).toContainText("Asked 3 models")
  await receipt.getByTestId("work-view").click()
  const members = reply.getByTestId("run-delegations").getByRole("listitem")
  await expect(members).toHaveCount(3)
  await expect(reply.getByTestId("run-delegations")).toContainText("Proposal A")
})

const sendAsk = async (page: Page) => {
  const asks = page.getByTestId("message-agent").filter({ hasText: "[[ask]]" })
  const before = await asks.count()
  await page.getByTestId("composer-input").fill(`[[ask]] ${Date.now()}`)
  await page.getByTestId("composer-send").click()
  await expect(asks).toHaveCount(before + 1)
  const reply = asks.nth(before)
  // The agent is waiting on the user: the question shows and the reply is still being written.
  await expect(reply.getByTestId("choice")).toContainText("Push the branch to GitHub?")
  await expect(reply).toHaveAttribute("data-status", "streaming")
  return reply
}

test("ask_user waits for the answer, and approving lets the agent continue", async ({ page }) => {
  const reply = await sendAsk(page)
  await expect(page.getByTestId("needs-you")).toContainText("needs you")
  await reply.getByTestId("choice-option").filter({ hasText: "Go ahead" }).click()
  await expect(reply).toHaveAttribute("data-status", "done")
  await expect(reply).toContainText("Approved. Go ahead")
  await expect(reply.getByTestId("choice-receipt")).toContainText("Chose Go ahead")
})

test("declining tells the agent not to do it", async ({ page }) => {
  const reply = await sendAsk(page)
  await reply.getByTestId("choice-option").filter({ hasText: "Not now" }).click()
  await expect(reply).toHaveAttribute("data-status", "done")
  await expect(reply).toContainText("Declined.")
})

test("sending something else instead of answering releases the waiting agent", async ({ page }) => {
  const reply = await sendAsk(page)
  const other = `actually, never mind ${Date.now()}`
  await page.getByTestId("composer-input").fill(other)
  await page.getByTestId("composer-send").click()
  await expect(reply).toHaveAttribute("data-status", "done")
  await expect(reply).toContainText("moved on without answering")
  await expect(
    page.getByTestId("message-agent").filter({ hasText: `Echo: ${other}` }),
  ).toBeVisible()
})

test("set_goal records a goal that later turns can see", async ({ page }) => {
  const reply = await newestReply(page, "[[goal]]")
  await expect(reply).toHaveAttribute("data-status", "done")
  // Check the goal is listed through the same MCP endpoint the model uses.
  const response = await page.request.post("/mcp", {
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "0" },
      },
    },
  })
  const session = response.headers()["mcp-session-id"] ?? ""
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
    "mcp-session-id": session,
    // Every Domo tool call carries a run header (real models always send one).
    "x-domo-run": "e2e",
  }
  await page.request.post("/mcp", {
    headers,
    data: { jsonrpc: "2.0", method: "notifications/initialized" },
  })
  const listed = await page.request.post("/mcp", {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_goals", arguments: {} },
    },
  })
  expect(await listed.text()).toContain("Ship kettlebell v2")
})

test("Domo can suggest a change to domo.md, and it's saved only after you say yes", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByTestId("composer-input").fill("[[instructions]] keep it short from now on")
  await page.getByTestId("composer-input").press("Enter")
  const save = page.getByRole("button", { name: /Save it/ }).last()
  await expect(save).toBeVisible()
  await save.click()
  await page.getByTestId("settings-open").click()
  await page.getByTestId("instructions-edit").click()
  await expect(page.getByTestId("instructions-text")).toHaveValue(/Keep answers under 100 words/)
})
