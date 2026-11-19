---
name: research-council
description: Research a question in parallel across Claude and Codex models, cross-check claims, and synthesize a sourced answer. Use for multi-source, comparative, or high-stakes factual questions.
---

# Research council

1. **Split** the question into 2–4 independent sub-questions.
2. **Fan out**: `delegate` each sub-question to a different model, alternating providers. Require sources for every claim.
3. **Cross-check**: send the merged claims to a model from the *other* provider, asking it to flag unsupported or conflicting claims.
4. **Synthesize**:
   - Lead with the answer in one sentence.
   - Follow with what it's based on.
   - Keep caveats and numbers; never fold them.
   - Attach sources behind "view".
5. Record durable findings with `remember`, stating why each one is durable.
