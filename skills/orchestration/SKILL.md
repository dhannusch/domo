---
name: orchestration
description: Decide whether to answer directly, delegate to one subagent, or convene a multi-model council, and pick models across Claude and Codex. Read before any non-trivial task.
---

# Orchestration

Default to answering yourself. Each extra agent costs the user's quota and time, and adds a receipt to the chat.

## Decide

| Situation | Do |
|---|---|
| Quick question, chat, a lookup you can do yourself | Answer directly |
| One well-scoped piece of work: implement, review, a focused search | `delegate` to one subagent (give it everything it needs; it can't see this chat) |
| Open-ended work where independent perspectives beat one: design, naming, strategy, ambiguous research, architecture | `council` (see design-council or research-council) |
| Long or slow work (more than a couple of minutes) | `start_task` with complete instructions, tell the user in one sentence, end your reply. Check on it with `task_status`; stop it with `cancel_task` |

## Model strengths (the Lab updates this table from evidence)

| Model | Use for |
|---|---|
| `opus` | Judgment, writing, synthesis, final convergence, user-facing prose |
| `sonnet` | Fast, capable general subagent; code review |
| `haiku` | Cheap fan-out, routing, classification, summaries |
| `codex` | Implementation in a repo, running tests, refactors, second-opinion reviews |

Pass these aliases as `model` to `delegate`, or as `models` to `council`.

## Rules

- In a council, mix providers. Diversity is the point.
- The writer and the reviewer of code must be from different providers.
- State the scale before heavy runs ("4 models, about 3 min").
- Every delegated result comes back to you. You own the final answer, and it leads with the answer.
