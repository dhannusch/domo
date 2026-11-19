import type { Comparison } from "@domo/domain"

/** 2–4 options on up to 4 attributes; stacks into cards on a phone (CSS). */
export function ComparisonView({ comparison }: { comparison: Comparison }) {
  return (
    <div className="comparison" data-testid="comparison">
      <table>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Option</span>
            </th>
            {comparison.attributes.map((attribute) => (
              <th key={attribute} scope="col">
                {attribute}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => {
            const recommended = row.option === comparison.recommended
            return (
              <tr key={row.option} className={recommended ? "recommended" : undefined}>
                <th scope="row">
                  {row.option}
                  {recommended ? <span className="comparison-pick">Recommended</span> : null}
                </th>
                {comparison.attributes.map((attribute, i) => (
                  <td key={attribute} data-label={attribute}>
                    {row.values[i] ?? ""}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
