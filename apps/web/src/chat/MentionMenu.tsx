import type { ModelOption } from "@domo/domain"

/** The model being typed after a leading `@` (only while no space has followed it yet). */
export const mentionQuery = (text: string): string | undefined =>
  /^@([a-z0-9-]*)$/i.exec(text)?.[1]?.toLowerCase()

export const mentionMatches = (models: ReadonlyArray<ModelOption>, query: string) =>
  models.filter(
    (m) => m.key.startsWith(query) || m.label.toLowerCase().includes(query.toLowerCase()),
  )

/**
 * Suggestions for a leading `@`: picking one keeps this conversation with that
 * model (it pins the topic); everything else follows the default model.
 */
export function MentionMenu({
  options,
  active,
  onPick,
}: {
  options: ReadonlyArray<ModelOption>
  active: number
  onPick: (key: string) => void
}) {
  return (
    <div className="mention-menu" data-testid="mention-menu">
      <p className="mention-caption">Keep this conversation with</p>
      <ul>
        {options.map((option, i) => (
          <li key={option.key}>
            <button
              type="button"
              className={`mention-option${i === active ? " active" : ""}`}
              data-testid={`mention-${option.key}`}
              aria-current={i === active}
              // Keep focus in the composer so typing carries on.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(option.key)}
            >
              <span>{option.label}</span>
              <span className="mention-alias">@{option.key}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
