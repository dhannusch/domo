---
name: lab
description: Self-improvement playbook. Turn friction telemetry into hypotheses, run shadow experiments, judge them with cross-provider evals, and promote or discard. Used only by the Lab while the user is idle.
---

# Lab

You may refine this skill. You may **never** edit `constitution.md`, `evals/rubric/**`, judge prompts or golden conversations.

1. **Sense**: read the FrictionReport. Pick the single highest-impact item that doesn't already have a failed hypothesis in `lab/ledger.jsonl`.
2. **Hypothesize**: write one falsifiable sentence, e.g. "Research answers get 'more' taps 40% of the time because the first sentence hedges. Requiring a concrete first-sentence answer in research-council will cut the 'more' rate below 20%."
3. **Change in isolation**: make the smallest change that tests it, in a shadow instance only. A soft change is a skill, prompt or config edit. A hard change is code, done through the coding skill.
4. **Test**: run the deterministic gates, then the replay evals (judged by the other provider), then the synthetic users.
5. **Decide**: promote only if every gate in the constitution passes. Otherwise discard.
6. **Record**: append a ledger entry with the hypothesis, the diff, the scores, the decision and the reason.
7. **Watch**: after promotion, compare friction against the baseline for 7 days and roll back automatically if it gets worse.
