import { join } from "node:path"
import { Context, Effect, FileSystem, Layer } from "effect"
import { DomoConfig } from "../config/DomoConfig.ts"
import { HomeGit } from "../memory/HomeGit.ts"

/** Long enough for real instructions, short enough to sit in every prompt. */
export const INSTRUCTIONS_MAX = 8000

export const INSTRUCTIONS_TEMPLATE = `# Domo

<!--
How Domo should be, in your words: its tone, how long answers should be, when to push back,
and standing rules ("always ask before booking anything", "no emoji"). Domo reads this before
every reply. Only you edit it; Domo can suggest a change, but saves it only if you say yes.
Text inside these comment marks is ignored.
-->
`

const path = (home: string) => join(home, "domo.md")

/** The file's text, or the template if there isn't one yet. */
export const readInstructions = (fs: FileSystem.FileSystem, home: string) =>
  fs.readFileString(path(home)).pipe(Effect.orElseSucceed(() => INSTRUCTIONS_TEMPLATE))

/** What goes into the prompt: the user's words without comments, or nothing if it's still empty. */
export const instructionsForPrompt = (text: string): string => {
  const body = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^# Domo\s*$/m, "")
    .trim()
  return body.length === 0
    ? ""
    : `## The user's instructions for you (domo.md)\nThe user wrote these. They take precedence over your default style and habits:\n\n${body}`
}

/**
 * `~/.domo/domo.md`, the user's own instructions for Domo. It's human-owned:
 * the settings sheet edits it, Domo may only propose changes the user approves,
 * and the Lab never touches it. Every save is a commit in ~/.domo.
 */
export class Instructions extends Context.Service<
  Instructions,
  {
    readonly read: Effect.Effect<string>
    save(text: string, by: "you" | "domo"): Effect.Effect<void>
  }
>()("domo/instructions/Instructions") {
  static readonly layer = Layer.effect(
    Instructions,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const git = yield* HomeGit
      const { home } = yield* DomoConfig
      const read = readInstructions(fs, home)
      const save = Effect.fn("Instructions.save")(function* (text: string, by: "you" | "domo") {
        const clean = text.slice(0, INSTRUCTIONS_MAX).trimEnd()
        yield* fs.makeDirectory(home, { recursive: true }).pipe(Effect.orDie)
        yield* fs.writeFileString(path(home), `${clean}\n`).pipe(Effect.orDie)
        yield* git.commit(
          by === "you" ? "you: edit domo.md" : "domo: update domo.md (approved by you)",
        )
      })
      return Instructions.of({ read, save })
    }),
  )
}
