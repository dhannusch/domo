import type { Checklist, Message } from "@domo/domain"
import { useAtomSet } from "@effect/atom-react"
import { useEffect, useState } from "react"
import { checkAtom } from "../atoms.ts"

/** Ticks show immediately; the server's update (or the agent's next checklist) confirms them. */
function ChecklistItem({
  message,
  index,
  label,
  done,
}: {
  message: Message
  index: number
  label: string
  done: boolean
}) {
  const check = useAtomSet(checkAtom)
  const [checked, setChecked] = useState(done)
  useEffect(() => setChecked(done), [done])
  return (
    <li>
      <label>
        <input
          type="checkbox"
          checked={checked}
          data-testid="checklist-item"
          onChange={(event) => {
            setChecked(event.target.checked)
            check({ payload: { messageId: message.id, index, done: event.target.checked } })
          }}
        />
        <span>{label}</span>
      </label>
    </li>
  )
}

export function ChecklistView({ message, checklist }: { message: Message; checklist: Checklist }) {
  return (
    <ul className="checklist" data-testid="checklist">
      {checklist.items.map((item, index) => (
        <ChecklistItem
          // biome-ignore lint/suspicious/noArrayIndexKey: items are addressed by position (the Check RPC uses the index)
          key={`${index}-${item.label}`}
          message={message}
          index={index}
          label={item.label}
          done={item.done}
        />
      ))}
    </ul>
  )
}
