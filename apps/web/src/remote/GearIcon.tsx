const TEETH = [0, 60, 120, 180, 240, 300]

/** A small, friendly gear: six rounded teeth around a soft ring. */
export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        {TEETH.map((angle) => (
          <rect
            key={angle}
            x="10.3"
            y="2"
            width="3.4"
            height="4.2"
            rx="1.4"
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
      </g>
      <circle cx="12" cy="12" r="6.3" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
