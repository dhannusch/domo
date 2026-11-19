---
name: getting-to-know-you
description: Interview the user to learn who they are, or work through something they pasted about themselves (like a memory export from another assistant). Use when they say "interview me", "get to know me", "ask me about myself", or paste notes about themselves to remember.
---

# Getting to know you

The goal is a short, pleasant conversation that leaves you knowing the user well enough to be
genuinely useful: who they are, who matters to them, how their days and weeks run, what they're
working toward, and how they like to be helped. Aim for about fifteen minutes, never an exam.

## Before you start

- `recall` what you already know, and read your profile. Don't ask anything you already know;
  confirm it instead ("You're building Domo on a Mac mini. Still the main project?").
- Say in one sentence what you'll do and that they can skip anything or stop at any time.

## How to ask

- **One question per message.** Short, specific, friendly. Never a list of questions.
- **Offer choices when answers fall into a few kinds:** use `render_choice` (2 to 4 options with
  free text always available), for example morning or evening person, how blunt you should be,
  how often to check in. Use open questions for people, projects and goals.
- **Follow the thread.** If an answer opens something important ("I'm launching in March"), ask
  one follow-up before moving on. Skip areas that clearly don't apply.
- **Checkpoint every five or so questions:** one line on what you've learned, then ask whether to
  keep going.

## What to cover, roughly in this order

1. **Work:** what they do, the main projects now, what a good week looks like.
2. **People:** partner, family, close friends and colleagues they'll mention. Names and how they
   relate, plus anything Domo should remember about them.
3. **Rhythm:** when they work best, when not to interrupt, time zone, recurring commitments.
4. **Goals:** what they want to get done in the next few months, and why it matters.
5. **Preferences:** food, travel, tools, things they love or can't stand, whatever comes up
   naturally.
6. **How to help:** how much autonomy they want, what to always ask about first, and how they like
   answers (length, tone, format).

## What to remember

- **Save as you go:** call `remember` right after each answer that will still be true in a month.
  One fact per memory, with a `why` saying how it'll help later. Use type `user` for facts about
  them and their people, `project` for ongoing work, and `feedback` for how they want you to work.
- **Skip the passing:** don't save today's mood, one-off plans, or anything they hedge ("maybe").
- **Be careful with sensitive topics:** health, money, relationships in trouble, legal matters.
  Ask before remembering ("Should I keep that in mind for later?") and save only what they agree to.
- **Behavior belongs in domo.md:** when they say how you should behave from now on ("be blunter",
  "never book without asking"), suggest it with `propose_instructions_change` instead of a memory.

## Pasted context

If they paste notes about themselves or a memory export from another assistant:

- Go through it fact by fact. Keep what will still matter, merge it with what you already know,
  and skip anything that looks outdated or that only another tool needed.
- Ask about anything sensitive, contradictory or unclear. Ask in one short list at the end, not
  one question per fact.
- Save as above, then say how many things you kept and give two or three examples.

## Wrapping up

End with a short summary of what you learned, grouped by the areas above (a `render_checklist` is
fine if it's long). Ask whether anything is wrong or missing. Correct memories they flag by
reusing the memory's name, which replaces it. Mention that they can say "interview me" again any
time, and that Settings › What Domo knows shows the summary you keep.
