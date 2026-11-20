import { Option, Predicate, Schema } from "effect"

/** The input fields that say what a tool call was about (Claude and Codex tools alike). */
const ToolInput = Schema.Struct({
  command: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  file_path: Schema.optionalKey(Schema.String),
  notebook_path: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
  pattern: Schema.optionalKey(Schema.String),
  query: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
})
const decodeInput = Schema.decodeUnknownOption(ToolInput)

export interface ToolAction {
  /** What happened, in plain words ("Edited notes.md"). */
  readonly action: string
  /** The specifics, if any (the command, the search), shown smaller. */
  readonly detail?: string
}

const fileName = (path: string) =>
  path
    .split("/")
    .filter((part) => part.length > 0)
    .at(-1) ?? path
const oneLine = (text: string, max = 140) => {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}
const withDetail = (action: string, detail: string | undefined): ToolAction =>
  detail === undefined || detail.length === 0 ? { action } : { action, detail: oneLine(detail) }

/** Turns a tool call into a line a person can read, for the work receipt's "view". */
export const describeTool = (name: string, rawInput: unknown): ToolAction => {
  const input = Option.getOrUndefined(decodeInput(rawInput))
  const file = input?.file_path ?? input?.notebook_path ?? input?.path
  const command =
    input?.command === undefined || Predicate.isString(input.command)
      ? input?.command
      : input.command.join(" ")
  switch (name) {
    case "Bash":
    case "shell":
      return withDetail("Ran a command", command)
    case "Read":
      return { action: file === undefined ? "Read a file" : `Read ${fileName(file)}` }
    case "Write":
      return { action: file === undefined ? "Wrote a file" : `Wrote ${fileName(file)}` }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return { action: file === undefined ? "Edited a file" : `Edited ${fileName(file)}` }
    case "Glob":
      return withDetail("Looked for files", input?.pattern)
    case "Grep":
      return withDetail("Searched inside files", input?.pattern)
    case "WebSearch":
    case "web_search":
      return withDetail("Searched the web", input?.query)
    case "WebFetch":
      return withDetail("Read a web page", input?.url)
    case "Task":
    case "Agent":
      return withDetail("Asked a helper", input?.description)
    default: {
      const tool = name.replace(/^mcp__[^_]+__|^[^.]+\./, "").replace(/_/g, " ")
      return withDetail(`Used ${tool}`, input?.query ?? input?.description)
    }
  }
}
