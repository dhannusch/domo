# Visual system reference

## Make the system coherent

Start with one visual mechanism: a simple idea that connects the symbol, wordmark treatment,
typography, palette, and layout. The mechanism should come from the approved strategy, not from a
generic prompt such as “modern” or “premium.”

Each direction should differ on at least two meaningful axes, such as editorial/technical,
quiet/expressive, or literal/abstract. Explain the tradeoff instead of calling one “better.”

## SVG-first production

SVG is the canonical format for marks because it preserves editable geometry, scales cleanly, and can
be rendered into PNG or WebP later. Use a simple viewBox, few clean paths, and no filters or gradients
unless the concept requires them. A small mark is a separate design problem, not merely a shrunken
large logo.

See the [W3C SVG overview](https://www.w3.org/Graphics/SVG/About) and [SVG specification](https://www.w3.org/TR/SVG/).

## Color and type

- Use semantic token names rather than scattering raw hex values.
- Test text and meaningful graphics against their actual grounds.
- Treat logo contrast exceptions separately from application accessibility.
- Prefer open, versioned fonts; [Google Fonts](https://developers.google.com/fonts) is a useful
  default source, but record the individual family's license.
- Outline or otherwise preserve the wordmark source when a font-dependent rendering would be fragile.

## Inspect the pixels

Always inspect a contact sheet or screenshot after rendering. Check small sizes, light/dark grounds,
and a real application. A valid SVG can still be visually wrong, clipped, muddy, or indistinguishable
from a common category mark.
