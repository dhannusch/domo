/**
 * Rejects changes to human-owned files when running autonomously (DOMO_AUTONOMOUS=1),
 * e.g. from the Lab or a background session. Wired into the pre-commit check.
 */
import { execFileSync } from "node:child_process"

const HUMAN_OWNED = [/^constitution\.md$/, /^evals\/rubric\//]

if (process.env.DOMO_AUTONOMOUS === "1") {
  const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0)
  const violations = staged.filter((file) => HUMAN_OWNED.some((pattern) => pattern.test(file)))
  if (violations.length > 0) {
    console.error(`Autonomous change to human-owned files rejected: ${violations.join(", ")}`)
    process.exit(1)
  }
}
