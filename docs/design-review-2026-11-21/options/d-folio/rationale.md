# D · Folio

Visual thesis: a personal working folio, using crisp graphite typography, cool paper and angular sage-edged decision surfaces.

Content plan: one conversation with a small date masthead; a fully legible, right-inset user turn; an open serif answer with original-message provenance; a clear decision object; fixed composing surface. Component specimen, settings, viewer and states are isolated review routes, not product navigation.

Interaction thesis: direct selection answers a Choice, View exposes original messages or work detail, and explicit Reply creates a cancellable quote. Native modal sheets retain a stable Done control. No automatic collapse, feed reordering, animation or ornamental movement.

Difference: desktop uses a small folio number in the unused margin; tighter angular surfaces and document typography make durable work feel intentional. Phone drops the margin number into the flow. Compared with Correspondence, this is more structured; compared with Quiet Utility, more editorial; compared with Soft Focus, firmer and less rounded.

Tradeoffs: framing the decision gives it authority but adds weight; the folio number may feel formal and is decorative, not a new navigation concept. A new user might prefer the warmth of rounded controls. Showing source correction and Reply as separate actions has a modest space cost. All remain touch-accessible.

Prototype boundaries: only local DOM state; no real messages, telemetry, tools or agent. It does not implement secure HTML, attachment delivery, actual model selection, network retries, or memory deletion. Questions do not send backend messages. File content and the week visualization are illustrative. Instructions explicitly report local preview saving. State specimen demonstrates active/queued/stopped/errors but is not a daemon state machine. Actual app behavior and all invariant tests remain for implementation after user choice.

Critique iteration: A and C flagged redundant Today/01/eyebrow labels and an undersized attach button on phone. B flagged a wide desktop line and decorative numbering. Removed all three repeated labels on phone, tightened decision spacing, enlarged attach to 44px, raised chart day labels to 12px, bounded prose to 62ch and declared the local variable font ranges. Fine grain now tiles at 160px instead of stretching into cloudy patches. The remaining desktop number is aria-hidden and has no navigation meaning. The framed decision remains deliberately firmer than A/C; content extends naturally below a short phone viewport rather than reducing targets.
