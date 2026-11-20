import { join } from "node:path"
import { Effect, FileSystem } from "effect"

export interface SkillSummary {
  readonly name: string
  readonly description: string
}

const frontmatter = (content: string): SkillSummary | undefined => {
  const block = /^---\n([\s\S]*?)\n---/.exec(content)?.[1]
  if (block === undefined) return undefined
  const field = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, "m").exec(block)?.[1]?.trim()
  const name = field("name")
  const description = field("description")
  return name === undefined || description === undefined ? undefined : { name, description }
}

/** Skills in the agent home (agent-owned after seeding), for the system prompt's index. */
export const skillIndex = Effect.fn("skillIndex")(
  function* (home: string) {
    const fs = yield* FileSystem.FileSystem
    const dir = join(home, "skills")
    if (!(yield* fs.exists(dir))) return []
    const names = yield* fs.readDirectory(dir)
    const skills = yield* Effect.forEach(names, (name) =>
      fs.readFileString(join(dir, name, "SKILL.md")).pipe(
        Effect.map(frontmatter),
        Effect.orElseSucceed(() => undefined),
      ),
    )
    return skills.filter((skill): skill is SkillSummary => skill !== undefined)
  },
  Effect.orElseSucceed(() => []),
)

/** A skill's full instructions; names are restricted so this can't read outside the skills folder. */
export const readSkill = Effect.fn("readSkill")(function* (home: string, name: string) {
  if (!/^[a-z0-9-]+$/.test(name)) return `There's no skill called "${name}".`
  const fs = yield* FileSystem.FileSystem
  return yield* fs
    .readFileString(join(home, "skills", name, "SKILL.md"))
    .pipe(Effect.orElseSucceed(() => `There's no skill called "${name}".`))
})

export const skillIndexText = (skills: ReadonlyArray<SkillSummary>) =>
  skills.length === 0
    ? ""
    : [
        "Skills (when one applies, call read_skill with its name before your first word on it; the description alone isn't enough):",
        ...skills.map((s) => `- ${s.name}: ${s.description}`),
      ].join("\n")
