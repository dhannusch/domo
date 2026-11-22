# B · Fold

Status: proposed, not approved. Authored November 21, 2026 from the scoped Domo brief.

One sentence: a solid corner and a folded leaf use one diagonal seam to suggest a note being put in order.

## Mechanism and mark

Two flat planes form a compact, almost square silhouette. The large upper/right corner is stable; the triangular lower-left leaf turns inward. Negative space creates the crease without a line or second tone. This is a corner-fold gesture rather than a complete file outline, a house or an arrow.

Palette: graphite #292929 on Chalk #f5f5f5; reverse uses the same pair. The symbol has no type dependency. Supporting application labels can use the app's Instrument Sans; the mark itself is custom path geometry.

## Application and distinction

A quiet abstract emblem for a tool that keeps notes and helps finish work. The solid mass is easy to find on a home screen, and the diagonal makes it recognizably different from the current ring/disc. Compared with a monogram it is less literal; compared with a conversation mark it is more document-like and less category-specific.

## Bounds and small-size treatment

The main ink bounds are x57.6–198.4, y57.6–198.4 on a 256 square, after a 1.1× optical enlargement around the center. The farthest possible rectangle corner is sqrt(70.4² + 70.4²) = 99.56px from the center, inside the maskable safe circle of radius102.4px. Background extends to the entire square. app.svg is therefore already maskable-safe; no separate geometry is needed.

The 16px optical variant enlarges the art to x2–14, y2–14, uses square corners and opens both crease entrances to1.5px. Its12px glyph is deliberate; a straight1/16 reduction would produce a smaller8.8px glyph with a0.825px seam. Use the optical source at16/24/32px; larger sizes use the main SVG and retain slight corner easing.

## Honest risk

The symbol is abstract and could read as a folded square or a geometric corner rather than Domo. It has no name recognition on first sight; a custom d would be more immediately attributable. At 16px the crease must remain open after rasterization.

## Provenance

Directly authored SVG path geometry by the Codex design subagent; no traced mark, external asset, font, raster image or image-generation backend. No trademark clearance claim. Canonical files: symbol.svg, app.svg, reversed.svg and small.svg. All are proposals pending user selection and parent pixel review.

## Peer revision

C flagged the initial main icon as visually smaller than A/C. Enlarged the regular/app art by10% around the center while preserving a conservative99.56px maximum corner radius inside the102.4px maskable circle. The small optical source remains on its deliberate16px grid.

Pixel review of the first board confirmed the original10px optical mark was too timid beside A. Enlarged it to12px, preserved a1.5px gap at both crease entrances and retained the same fold mechanism. The canonical PWA mark did not need further enlargement.
