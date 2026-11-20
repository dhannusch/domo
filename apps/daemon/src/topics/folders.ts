import { join } from "node:path"
import { Topic } from "@domo/domain"
import { Effect, type FileSystem } from "effect"

export const NOTES_FILE = "notes.md"
/** The most of notes.md that goes into a run's context; the agent can read the rest. */
const NOTES_IN_CONTEXT = 8000

export const folderName = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "topic"

export const folderPath = (home: string, folder: string) => join(home, "topics", folder)

/** A folder name for this title that no other topic uses yet. */
export const freeFolderName = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  home: string,
  title: string,
) {
  const base = folderName(title)
  let name = base
  for (let n = 2; yield* fs.exists(folderPath(home, name)); n++) name = `${base}-${n}`
  return name
}, Effect.orDie)

/**
 * Gives a topic its own folder under `<home>/topics/` the first time it runs (named after its
 * title, never renamed after) with a starting notes.md. Returns the topic with `folder` set.
 */
export const ensureFolder = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  home: string,
  topic: Topic,
) {
  if (topic.folder !== undefined) {
    yield* fs.makeDirectory(folderPath(home, topic.folder), { recursive: true })
    return topic
  }
  const name = yield* freeFolderName(fs, home, topic.title)
  const path = folderPath(home, name)
  yield* fs.makeDirectory(path, { recursive: true })
  yield* fs.writeFileString(join(path, NOTES_FILE), `# ${topic.title}\n`)
  return new Topic({ ...topic, folder: name })
}, Effect.orDie)

export const readNotes = (fs: FileSystem.FileSystem, home: string, folder: string) =>
  fs.readFileString(join(folderPath(home, folder), NOTES_FILE)).pipe(Effect.orElseSucceed(() => ""))

/** What a run in this topic is told about its folder, with the current notes. */
export const folderContext = (path: string, notes: string, workingThere: boolean) => {
  const shown =
    notes.length <= NOTES_IN_CONTEXT
      ? notes.trim()
      : `${notes.slice(0, NOTES_IN_CONTEXT).trim()}\n… (read ${NOTES_FILE} for the rest)`
  return [
    `This topic has its own folder: ${path}${workingThere ? " (your working directory)" : ""}.`,
    `Keep ${NOTES_FILE} there current, quietly: the plan, decisions, open questions, people and ` +
      "links worth finding again for this topic. Facts about the user themselves go to `remember`, " +
      `not here. Put drafts, research and longer documents in their own files in the folder and list ` +
      `them in ${NOTES_FILE}. When the user asks to see the plan or notes, read the file and show it.`,
    `${NOTES_FILE} now:\n${shown}`,
  ].join("\n")
}
