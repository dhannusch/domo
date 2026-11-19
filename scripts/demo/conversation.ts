import { ComponentId, type UiComponent, type WorkReceipt } from "@domo/domain"

/** One exchange of the demo conversation (fictional, used for the README screenshots). */
export interface DemoTurn {
  readonly user: string
  readonly agent: string
  readonly model: string
  readonly component?: UiComponent
  readonly work?: Omit<WorkReceipt, "runId" | "id" | "_tag">
}

const OPUS = "claude:claude-opus-5-5"
const CODEX = "codex:default"

const HEAT_PUMP = `<svg viewBox="0 0 420 300" width="100%" role="img" aria-label="Heat pump loop">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--accent)"/></marker><marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--pencil)"/></marker></defs>
<g fill="none" stroke-width="3">
<path d="M158 72H260" stroke="var(--accent)" marker-end="url(#a)"/>
<path d="M340 107V194" stroke="var(--accent)" marker-end="url(#a)"/>
<path d="M262 232H160" stroke="var(--pencil)" marker-end="url(#b)"/>
<path d="M80 197V110" stroke="var(--pencil)" marker-end="url(#b)"/>
</g>
<g fill="var(--paper-deep)" stroke="var(--ink)" stroke-width="1.5">
<rect x="5" y="40" width="150" height="64" rx="12"/><rect x="265" y="40" width="150" height="64" rx="12"/>
<rect x="265" y="200" width="150" height="64" rx="12"/><rect x="5" y="200" width="150" height="64" rx="12"/>
</g>
<g font-family="-apple-system, Helvetica, Arial, sans-serif" text-anchor="middle">
<g fill="var(--ink)" font-size="16" font-weight="600">
<text x="80" y="69">Outdoor coil</text><text x="340" y="69">Compressor</text>
<text x="340" y="229">Indoor coil</text><text x="80" y="229">Expansion valve</text>
</g>
<g fill="var(--pencil)" font-size="14">
<text x="80" y="90">gathers heat</text><text x="340" y="90">squeezes it hot</text>
<text x="340" y="250">warms the room</text><text x="80" y="250">cools it again</text>
<text x="209" y="61">−10°C gas</text><text x="211" y="222">warm liquid</text>
<text x="330" y="156" text-anchor="end">60°C gas</text><text x="92" y="156" text-anchor="start">cold liquid</text>
</g>
</g>
</svg>`

export const DEMO: ReadonlyArray<DemoTurn> = [
  {
    user: "Can you compare the two contractor quotes for the kitchen?",
    agent:
      "Go with Hale & Co. They cost $1,500 more, but they start seven weeks sooner and their warranty is twice as long.",
    model: OPUS,
    component: {
      _tag: "Comparison",
      id: ComponentId.make("demo-compare"),
      attributes: ["Price", "Start", "Warranty"],
      rows: [
        { option: "Hale & Co.", values: ["$18.4k", "Dec 2", "2 years"] },
        { option: "Birch Build", values: ["$16.9k", "Jan 20", "1 year"] },
      ],
      recommended: "Hale & Co.",
    },
  },
  {
    user: "Hale it is. What has to happen before they start?",
    agent: "Three things before December 2. I've already done the first.",
    model: OPUS,
    component: {
      _tag: "Checklist",
      id: ComponentId.make("demo-steps"),
      items: [
        { label: "Confirm the start date with Hale & Co.", done: true },
        { label: "Pay the 10% deposit ($1,840)", done: false },
        { label: "Clear the kitchen by Nov 30", done: false },
      ],
    },
  },
  {
    user: "Clean up the budget script and make sure the totals add up.",
    agent: "Done. The totals now round once, at the end, so they match the quotes to the cent.",
    model: CODEX,
    work: {
      status: "done",
      summary: "Edited 2 files, tests pass",
      models: [CODEX],
      project: "home-budget",
    },
  },
  {
    user: "How does the heat pump they're installing actually work?",
    agent:
      "It moves heat instead of making it. Outside, the refrigerant is colder than the air, so it soaks up heat even in winter. The compressor squeezes it hot, and indoors that heat flows into the room.",
    model: OPUS,
    component: {
      _tag: "Visual",
      id: ComponentId.make("demo-visual"),
      title: "How a heat pump moves heat indoors",
      summary:
        "A loop: the outdoor coil gathers heat, the compressor heats the gas to 60°C, the indoor coil releases it, and the expansion valve cools it again.",
      html: HEAT_PUMP,
    },
  },
  {
    user: "Book the deposit call for tomorrow morning?",
    agent: "Tomorrow at 7:30 is their first free slot. I haven't booked it yet.",
    model: OPUS,
    component: {
      _tag: "Choice",
      id: ComponentId.make("demo-choice"),
      question: "When should I book the deposit call?",
      options: [
        { value: "730", label: "7:30 tomorrow", consequence: "Their first slot" },
        { value: "900", label: "9:00 tomorrow", consequence: "After your standup" },
      ],
      reversible: true,
      recommended: "730",
    },
  },
]
