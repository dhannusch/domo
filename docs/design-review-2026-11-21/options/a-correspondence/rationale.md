# A — Correspondence

**Visual thesis:** A cool paper reading surface with confident literary type and the spare, asymmetric rhythm of a personal letter.

**Content plan:** A small date masthead; the person's message inset to the right; Domo's full-width response; checkable source controls; a compact decision; composing anchored at the bottom. The reading column is 680px on desktop and uses 20px phone gutters. The component specimen, settings, file and state screens are review modes selected by URL, not product navigation.

**Interaction thesis:** Quiet borders identify taps; recommendations use an explicit label and a stronger sage edge. Source, receipt and settings details appear only on request. Native dialogs preserve focus containment. No message insertion animation, automatic collapse, reordering, scroll effect or ornamental motion is introduced. Touch press feedback and a short color transition supply enough acknowledgment without moving the page.

## Why choose it

The most reading-oriented direction. Full-contrast user messages have their own alignment and type, while Domo's reply has generous leading and almost no framing. Choice controls feel deliberate rather than like a form. Source correction and Reply stay discoverable on phones. Questions, comparison and work receipts reuse type/spacing rather than identical enclosing cards.

## Tradeoffs

- More whitespace and larger prose make long histories longer.
- Borderless noninteractive results need disciplined spacing to remain clearly grouped.
- The desktop reading column stays narrow; extra screen area remains quiet rather than becoming a workbench.
- A phone Choice stacks vertically; its second option may require a small scroll on shorter devices.

## Prototype limits

All interactions are local demonstrations. Choice submits immediately, records the selected answer and retains its controls in place to avoid collapsing history. Send appends a local message only; attachments use a clearly named sample instead of uploading; settings do not persist. No models, actual memory, telemetry, backend queue, filesystem or secure Visual sandbox is connected. The static chart represents a Visual styling specimen. Native dialog behavior is used, but physical iPhone keyboard and screen-reader validation remain implementation work.

## Review and revisions

Peer critique retained the open reading surface and source/Reply row. Revisions: reduced desktop prose from 23px/37px to 21px/34px to temper scroll length; removed external-navigation arrows from immediate-submit choices; changed Reply to a reply arrow; changed the file handoff to an explicit View label; tiled fine grain at 160px rather than allowing an SVG background to stretch into cloudy patches. The phone needs-you control now has a 44px hit area. Added connection/reconnecting, Earlier/return, pairing, proposed instructions and notification states. The 375px screenshot keeps both options and Something else above the composer; 320px reflow remains a parent verification step.
