import { expect, test } from "@playwright/test"

test("a background task runs on its own while the chat stays free, then posts its result", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByTestId("composer-input").fill(`[[task]] ${Date.now()}`)
  await page.getByTestId("composer-send").click()

  const task = page
    .getByTestId("message-agent")
    .filter({ has: page.getByTestId("task-running") })
    .last()
  await expect(task).toContainText("Working on this in the background: Gather contractor quotes")
  await expect(page.getByTestId("needs-you")).toContainText("running")

  // The chat isn't blocked while the task runs.
  const other = `meanwhile ${Date.now()}`
  await page.getByTestId("composer-input").fill(other)
  await page.getByTestId("composer-send").click()
  await expect(
    page.getByTestId("message-agent").filter({ hasText: `Echo: ${other}` }),
  ).toHaveAttribute("data-status", "done")

  // Then the task finishes in place.
  const finished = page
    .getByTestId("message-agent")
    .filter({ hasText: "Finished: Gather contractor quotes" })
    .last()
  await expect(finished).toHaveAttribute("data-status", "done", { timeout: 10_000 })
})
