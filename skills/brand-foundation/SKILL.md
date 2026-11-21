---
name: brand-foundation
description: Build or refine a brand's strategy, positioning, messaging, voice, naming criteria, and copy, with a durable topic-local brand pack. Use when the user asks to create, refresh, name, position, or write for a brand; do not use for ordinary copy editing without brand context.
---

# Brand foundation

Build the words before the visual system. Keep Domo general-purpose: load this skill only for
brand work, and preserve the user's existing strategy when a brand pack already exists.

## Start with the smallest useful brief

Read [references/source-map.md](references/source-map.md) and the relevant strategy/copy reference
before starting. Inspect the current topic files and any supplied site, repository, audience evidence,
competitor examples, or existing brand materials. Ask only for missing facts that change the work.

Create or update the topic-local `brand-pack/` directory using the templates in
`templates/brand-pack/`. Do not put project-specific facts in Domo's general user memory.

The foundation should make these distinctions explicit:

- fact: directly supplied or sourced;
- inference: a reasoned interpretation;
- hypothesis: plausible but unproven;
- recommendation: creative or strategic judgment.

Never turn an inference into a public claim without recording its evidence and confidence in
`brand-pack/claims.json`.

## Strategy and copy workflow

1. Define the audience situation and the progress they need, not just demographics.
2. State the category, alternatives, positioning, promise, proof, and unresolved assumptions.
3. Define a stable voice and context-dependent tones with do/don't examples.
4. Build a message hierarchy: one-line promise, short explanation, proof, objections, and calls to action.
5. Draft the requested copy using concrete nouns, active verbs, and the reader's situation.
6. Review for clarity, unsupported claims, jargon, generic AI language, and consistency with the pack.

For open-ended strategy, naming, or positioning work, use Domo's existing `council` with 3–4 mixed
models and a blind critique round. Tell the user in one short sentence before calling it. Use a single
writer plus a reviewer for small copy refinements; do not spend a council on every sentence.

Do not make AIDA, StoryBrand, Golden Circle, or similar formulas mandatory. Use them only when they
solve a specific problem better than direct writing.

## Checkpoints and delivery

Show the recommendation first, then a compact comparison or choice when the user must decide. Keep
the decision behind the card, not buried in a long explanation. Do not mark a direction approved until
the user chooses it.

When the foundation is stable, update `foundation.md`, `voice.md`, `messages.md`, `claims.json`, and
`decisions.md`, then tell the user exactly which files changed. Hand the approved foundation to
`brand-identity` rather than inventing visual choices independently.

## Supporting resources

- Strategy principles: [references/strategy.md](references/strategy.md)
- Copy and voice: [references/copy.md](references/copy.md)
- Claims, naming, and rights: [references/claims.md](references/claims.md)
- Research provenance and workflow evidence: [references/source-map.md](references/source-map.md)
- Shared pack templates: [templates/brand-pack/](templates/brand-pack/)
- Pack utilities: [scripts/](scripts/)
