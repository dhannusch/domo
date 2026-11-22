# Soft Focus designer's peer critique

Review based on the other directions' authored HTML/CSS/JS and rationale, before parent screenshot QA. Distinguish concrete implementation issues from aesthetic tradeoffs.

## A · Correspondence

Strongest quality: the open serif surface and narrow reading measure make long answers feel like correspondence. Source and Reply live in the same compact row, a better use of scarce phone height than C's separated rows. The unboxed comparison and work receipt keep results from becoming an app of nested containers.

Risks: desktop prose is 21px/34px, significantly larger than the shared 17–18px brief; it is a deliberate editorial choice but increases scroll and can feel like an essay app during short exchanges. At phone width the source row has From Wednesday, View, Not quite and Reply, which may wrap and deserves screenshot inspection. The choice footer's “Selection replies immediately” is helpful commitment information but repeats a mechanical explanation in the primary chat.

Suggested refinement: inspect the full hero at 375×812 with all choice actions visible or a clear continuation below; consider 19–20px desktop prose if density becomes excessive. Preserve the visible Reply rather than hiding it for purity. Its open composition should remain visibly distinct from B and D.

## B · Quiet Utility

Strongest quality: the most explicit operational hierarchy. Speaker labels, compact component headers, consistent rows and purposeful recommendation treatment support quick decisions and working states. It is a plausible efficient daily tool rather than a reading destination.

Concrete check: `.source-line .quiet` is 36px tall on desktop, below our practical 44px target, though phone overrides to 44px. If the project target applies across input modes, use the same hit area everywhere. Several phone labels are 11px (recommendation, visual day labels, composer status); those are not necessarily a WCAG failure but weaken the legibility improvement the sweep aims to deliver. Source View and Not quite both remain discoverable, which is good.

Risks: speaker labels plus a user plate plus a recommendation frame can accumulate chrome. The component specimen headline “Made for the conversation” is marketing-like but isolated to review, so it should not migrate into the app. Tight typography can feel less personal than the other directions.

Suggested refinement: raise small phone metadata to 12–13px and check text wrapping instead of shrinking it. Keep the utilitarian density; that is its useful distinction.

## D · Folio

Strongest quality: an angular, document-oriented system that makes attachments and durable output feel substantial. The margin folio marker gives desktop composition an identity, and source/readable-file integration is strong. Explicit quiet actions remain accessible without hover.

Concrete check: phone week-day labels are 11px and should be raised or simplified. At 375px, folio marker + source controls + outer Choice frame + 100px option minimums add vertical cost; inspect whether one decision feels like too many nested boundaries. The marker becomes a line in the phone flow, so its usefulness should justify that extra line.

Risks: formal numbering may imply separate documents or a task structure despite the one-chat model. The rationale correctly identifies this as decorative. Framed Choice, bordered options and bordered actions can feel heavier than durable prose needs.

Suggested refinement: drop the decorative marker on phone rather than moving it into flow if captures show crowding. Reserve document-like formality for files and receipts while keeping conversational prose open. Preserve D's angular geometry rather than converging on C's tactile roundness.

## What C can learn

A's source/Reply row offers an opportunity to reduce C's phone scroll without sacrificing comfort. B's textual state clarity should carry into C's rounded states. D's stable document heading and close controls set the right file-viewer standard. C should not add an outer frame to Choice: the options themselves are already the interaction surfaces.

## Screenshot review

Inspected the initial 375px chat captures of all four options, plus C desktop. A's compact source/correction/reply row fits at 375px and keeps the complete choice visible. B's decision box is easy to scan, but its Reply is clipped by the fixed composer at the initial viewport; it needs enough scroll clearance and perhaps a tighter source/heading arrangement. D's Today and folio number consume enough height that only its first option is visible initially; dropping these two decorative lines on phone is the most valuable refinement. C fits the complete choice and visible Reply without a scroll, but its initial prose appears too heavy. Corrected the variable font-face weight ranges and used regular 18px desktop prose, preserving 17px phone prose. All four initial surfaces show cloudy enlarged grain; C now tiles a subtle 160px paper grain instead.
