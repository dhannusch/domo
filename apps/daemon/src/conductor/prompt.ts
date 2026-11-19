import { Effect, FileSystem } from "effect"
import type { DomoConfigShape } from "../config/DomoConfig.ts"
import type { GoalStore } from "../goals/GoalStore.ts"
import { skillIndex, skillIndexText } from "../mcp/skills.ts"
import type { Memory } from "../memory/Memory.ts"
import { labelFor, resolveModel } from "../models/registry.ts"
import { PERSONA } from "./persona.ts"

/** Active goals in one line each, so every turn knows what the user is working toward. */
const goalsText = (goals: GoalStore["Service"]) =>
  goals.active.pipe(
    Effect.map((list) =>
      list.length === 0
        ? ""
        : [
            "The user's active goals (record progress with update_goal when it happens):",
            ...list
              .slice(0, 8)
              .map(
                (g) => `- ${g.title} (id ${g.id})${g.due === undefined ? "" : `, due ${g.due}`}`,
              ),
          ].join("\n"),
    ),
  )

/** The one memory always in context: who the user is and how they like to work. */
const profileText = (memory: Memory["Service"]) =>
  memory.profile.pipe(
    Effect.map((profile) =>
      profile.trim().length === 0
        ? ""
        : `What you know about the user (profile):\n${profile.trim()}`,
    ),
  )

/** Persona, profile, skill index and active goals; all of them change between runs. */
export const makeSystemPrompt = (
  config: DomoConfigShape,
  fs: FileSystem.FileSystem,
  goals: GoalStore["Service"],
  memory: Memory["Service"],
): Effect.Effect<string> =>
  Effect.all([
    profileText(memory),
    skillIndex(config.home).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.map(skillIndexText),
    ),
    goalsText(goals),
  ]).pipe(
    Effect.map(([profile, skills, active]) =>
      [PERSONA, profile, skills, active].filter((part) => part.length > 0).join("\n\n"),
    ),
  )

/** "Codex", "Opus 5.5" — the label for a model key in receipts. */
export const nameOf = (key: string) => {
  const model = resolveModel(key)
  return model === undefined ? key : labelFor(model)
}

export const mcpUrlFor = (config: DomoConfigShape) => `http://127.0.0.1:${config.port}/mcp`

/** Where agent runs reach Domo's tools, with the daemon's access token when it has one. */
export const mcpFor = (config: DomoConfigShape) => ({
  url: mcpUrlFor(config),
  headers: config.token === undefined ? {} : { authorization: `Bearer ${config.token}` },
})
