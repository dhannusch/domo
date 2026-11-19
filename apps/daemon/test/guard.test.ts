import { MessageId, RunId } from "@domo/domain"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect } from "effect"
import { ChatBus } from "../src/chat/ChatBus.ts"
import { approvalNeeded, classifyCommand } from "../src/providers/guard.ts"

describe("classifyCommand", () => {
  it.each([
    ["git push origin main", "git push"],
    ["git -C repo push --force", "git push"],
    ["npm publish --access public", "publish"],
    ["bunx wrangler deploy", "deploy"],
    ["gh pr merge 12 --squash", "deploy"],
    ["rm -rf ~/old-project", "delete files"],
    ["sudo softwareupdate -i -a", "system settings"],
    ["curl -X POST https://api.example.com/send -d '{}'", "send outside"],
    ["ssh devbox 'ls'", "send outside"],
  ])("guards %s", (command, action) => {
    expect(classifyCommand(command)).toBe(action)
  })

  it.each([
    "git status",
    "git commit -m 'fix'",
    'git commit -m "fix the push button"',
    "echo 'rm -rf is dangerous'",
    "bun test",
    "rm build.log",
    "curl https://example.com",
    "ls -la",
  ])("allows %s", (command) => {
    expect(classifyCommand(command)).toBeUndefined()
  })

  it("tells subagents to report back instead of asking", () => {
    expect(approvalNeeded("git push", true)).toContain("ask_user")
    expect(approvalNeeded("git push", false)).toContain("report back")
  })
})

describe("ChatBus asks and approvals", () => {
  it.effect("an answer reaches the waiting agent once; a new message releases the rest", () =>
    Effect.gen(function* () {
      const bus = yield* ChatBus
      const first = yield* bus.registerAsk(MessageId.make("m1"))
      const second = yield* bus.registerAsk(MessageId.make("m2"))
      const answer = {
        _tag: "Answered",
        value: "approve",
        label: "Go ahead",
        freeText: false,
      } as const
      expect(yield* bus.completeAsk(MessageId.make("m1"), answer)).toBe(true)
      expect(yield* bus.completeAsk(MessageId.make("m1"), answer)).toBe(false)
      expect(yield* Deferred.await(first)).toEqual(answer)
      yield* bus.releaseAsks
      expect(yield* Deferred.await(second)).toEqual({ _tag: "MovedOn" })
    }).pipe(Effect.provide(ChatBus.layer)),
  )

  it.effect("approvals are scoped to one run", () =>
    Effect.gen(function* () {
      const bus = yield* ChatBus
      yield* bus.approve(RunId.make("r1"), "git push")
      expect(yield* bus.isApproved(RunId.make("r1"), "git push")).toBe(true)
      expect(yield* bus.isApproved(RunId.make("r2"), "git push")).toBe(false)
      expect(yield* bus.isApproved(RunId.make("r1"), "deploy")).toBe(false)
    }).pipe(Effect.provide(ChatBus.layer)),
  )
})
