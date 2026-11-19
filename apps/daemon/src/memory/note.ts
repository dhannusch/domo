import { Option, Schema } from "effect"

export const MemoryType = Schema.Literals(["user", "feedback", "project", "reference"])
export type MemoryType = typeof MemoryType.Type

/** Frontmatter of one memory note (values are plain strings in the file). */
const Frontmatter = Schema.Struct({
  name: Schema.NonEmptyString,
  type: MemoryType,
  created: Schema.String,
  last_used: Schema.String,
  uses: Schema.String,
  why: Schema.optionalKey(Schema.String),
  supersedes: Schema.optionalKey(Schema.String),
})
const decodeFrontmatter = Schema.decodeUnknownOption(Frontmatter)

/** One fact the agent chose to keep, in ~/.domo/memory/<name>.md. */
export interface MemoryNote {
  readonly name: string
  readonly type: MemoryType
  readonly created: string
  readonly lastUsed: string
  readonly uses: number
  /** Why this fact is durable (the write gate requires it). */
  readonly why?: string
  readonly supersedes?: string
  readonly body: string
}

/** "Kitchen contractor!" → "kitchen-contractor"; names are file names. */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

export const parseNote = (content: string): Option.Option<MemoryNote> => {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (match === null) return Option.none()
  const fields: Record<string, string> = {}
  for (const line of (match[1] ?? "").split("\n")) {
    const at = line.indexOf(":")
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return Option.map(decodeFrontmatter(fields), (f) => ({
    name: f.name,
    type: f.type,
    created: f.created,
    lastUsed: f.last_used,
    uses: Number.isFinite(Number(f.uses)) ? Number(f.uses) : 0,
    body: (match[2] ?? "").trim(),
    ...(f.why === undefined ? {} : { why: f.why }),
    ...(f.supersedes === undefined ? {} : { supersedes: f.supersedes }),
  }))
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()

export const serializeNote = (note: MemoryNote) =>
  [
    "---",
    `name: ${note.name}`,
    `type: ${note.type}`,
    `created: ${note.created}`,
    `last_used: ${note.lastUsed}`,
    `uses: ${note.uses}`,
    ...(note.why === undefined ? [] : [`why: ${oneLine(note.why)}`]),
    ...(note.supersedes === undefined ? [] : [`supersedes: ${oneLine(note.supersedes)}`]),
    "---",
    "",
    note.body.trim(),
    "",
  ].join("\n")

const STOP = new Set(
  "a an and are as at be by for from has have i in is it its of on or that the this to was were will with you your my me we our".split(
    " ",
  ),
)

/** Meaningful words, for duplicate detection and search queries. */
export const keywords = (text: string): ReadonlyArray<string> => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9$]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  ),
]

/** Overlap of meaningful words (0–1); near-duplicates score above ~0.6. */
export const similarity = (a: string, b: string): number => {
  const x = new Set(keywords(a))
  const y = new Set(keywords(b))
  if (x.size === 0 || y.size === 0) return 0
  const shared = [...x].filter((w) => y.has(w)).length
  return shared / Math.min(x.size, y.size)
}

/** An FTS5 query that matches any keyword (prefix), safe against FTS syntax in user text. */
export const ftsQuery = (text: string) =>
  keywords(text)
    .slice(0, 12)
    .map((w) => `"${w.replace(/"/g, "")}"*`)
    .join(" OR ")
