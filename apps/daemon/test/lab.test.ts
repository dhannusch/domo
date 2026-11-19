import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_MAIN_MODEL, Message, MessageId, Topic, TopicId } from "@domo/domain"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer } from "effect"
import { ChatStore } from "../src/chat/ChatStore.ts"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { frictionScore, regressed } from "../src/lab/friction.ts"
import { Lab } from "../src/lab/Lab.ts"
import { HomeGit } from "../src/memory/HomeGit.ts"
import { layerEcho } from "../src/providers/EchoProvider.ts"
import { DatabaseTest } from "../src/store/Database.ts"
import { Telemetry } from "../src/telemetry/Telemetry.ts"

const SKILL = "---\nname: chief-of-staff\ndescription: Tone\n---\n- Be brief.\n"

const freshHome = () => {
  const home = mkdtempSync(join(tmpdir(), "domo-lab-"))
  mkdirSync(join(home, "skills", "chief-of-staff"), { recursive: true })
  writeFileSync(join(home, "skills", "chief-of-staff", "SKILL.md"), SKILL)
  return home
}

const makeLayer = (home: string) =>
  Lab.layer.pipe(
    Layer.provideMerge(ChatStore.layer),
    Layer.provideMerge(Telemetry.layer),
    Layer.provide(HomeGit.layerNoop),
    Layer.provide(layerEcho),
    Layer.provideMerge(DomoConfig.layerFrom({ home, port: 0 })),
    Layer.provideMerge(DatabaseTest),
    Layer.provideMerge(NodeFileSystem.layer),
  )

/** Three finished exchanges and some friction, as real use would leave them. */
const seed = Effect.gen(function* () {
  const store = yield* ChatStore
  const now = yield* DateTime.now
  const topic = new Topic({
    id: TopicId.make("t"),
    title: "Kitchen",
    status: "live",
    stakes: "low",
    summary: "",
    sourceMessageIds: [],
    folded: false,
    model: DEFAULT_MAIN_MODEL,
    lastActivityAt: now,
  })
  yield* store.upsertTopic(topic)
  for (const i of [1, 2, 3]) {
    const base = { topicId: topic.id, status: "done" as const, createdAt: now }
    yield* store.insertMessage(
      new Message({ ...base, id: MessageId.make(`u${i}`), role: "user", text: `q${i}` }),
    )
    yield* store.insertMessage(
      new Message({
        ...base,
        id: MessageId.make(`a${i}`),
        role: "agent",
        text: `a${i}`,
        model: "claude:opus",
      }),
    )
  }
  const telemetry = yield* Telemetry
  yield* telemetry.record({ _tag: "MoreExpanded", messageId: MessageId.make("a1") })
})

describe("friction", () => {
  it("weights by severity per user message", () => {
    expect(frictionScore(new Map([["RestatementRejected", 1]]), 3)).toBe(1)
    expect(frictionScore(new Map(), 0)).toBe(0)
  })
  it("treats a 10% rise as a regression", () => {
    expect(regressed(1, 1.05)).toBe(false)
    expect(regressed(1, 1.2)).toBe(true)
  })
})

describe("Lab", () => {
  it.live("promotes a skill edit that wins the blind replay", () => {
    const home = freshHome()
    return Effect.gen(function* () {
      yield* seed
      const report = yield* (yield* Lab).run
      expect(report.experiment).toBe("promoted")
      const skill = readFileSync(join(home, "skills", "chief-of-staff", "SKILL.md"), "utf8")
      expect(skill).toContain("under 15 words")
      const ledger = readFileSync(join(home, "lab", "ledger.jsonl"), "utf8")
      expect(ledger).toContain('"decision":"promoted"')

      const lab = yield* Lab
      const [change] = yield* lab.changes
      expect(change?.status).toBe("watching")
      expect(yield* lab.undo(change?.id ?? "")).toBe(true)
      expect((yield* lab.changes)[0]?.status).toBe("undone")
      expect(yield* lab.undo(change?.id ?? "")).toBe(false)
    }).pipe(Effect.provide(makeLayer(home)))
  })

  it.live("skips when there is no friction", () => {
    const home = freshHome()
    return Effect.gen(function* () {
      const report = yield* (yield* Lab).run
      expect(report.experiment).toBe("skipped")
      expect(readFileSync(join(home, "skills", "chief-of-staff", "SKILL.md"), "utf8")).toBe(SKILL)
    }).pipe(Effect.provide(makeLayer(home)))
  })

  it.live("reverts a promotion whose watch saw friction rise", () => {
    const home = freshHome()
    return Effect.gen(function* () {
      yield* seed
      yield* Effect.sleep("5 millis")
      const now = DateTime.formatIso(yield* DateTime.now)
      mkdirSync(join(home, "lab"), { recursive: true })
      const entry = {
        id: "e1",
        at: "2026-01-01T00:00:00.000Z",
        kind: "experiment",
        skill: "chief-of-staff",
        hypothesis: "h",
        decision: "promoted",
        commit: "abc",
        baselineFriction: 0,
        watchUntil: now,
      }
      writeFileSync(join(home, "lab", "ledger.jsonl"), `${JSON.stringify(entry)}\n`)
      const report = yield* (yield* Lab).run
      expect(report.reverted).toBe(1)
      expect(readFileSync(join(home, "lab", "ledger.jsonl"), "utf8")).toContain(
        '"decision":"reverted"',
      )
    }).pipe(Effect.provide(makeLayer(home)))
  })
})
