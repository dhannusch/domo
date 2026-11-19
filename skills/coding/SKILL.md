---
name: coding
description: Plan, implement, test and review code changes in a registered project using a cross-provider writer and reviewer. Use for any change to a code repository.
---

# Coding

1. **Confirm the project**: show the project on the work receipt *before the first write*. If the project is uncertain, ask with a Choice.
2. **Plan**: write a short plan that names the files involved and what "done" means. For non-trivial work, show it as a Checklist.
3. **Implement**: `delegate` to the implementer (default: Codex) with `cwd` set to the project. Pass it the project's AGENTS.md or CLAUDE.md conventions.
4. **Verify**: run the project's own checks and tests. Never claim it passes without the output.
5. **Review**: `delegate` the diff to a reviewer from the **other** provider. Fix real findings, then re-run the checks.
6. **Report**: one work receipt, e.g. "Edited 3 files · tests pass · view". Never push, deploy or delete outside the project without `ask_user`.
