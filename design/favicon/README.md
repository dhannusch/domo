# Domo favicon / PWA icon study

Three authored SVG proposals based on the approved Chalk UI. Selected: A Custom d, after the user delegated the choice and requested commit/push. It is now wired into the production favicon and PWA assets.

[Open the comparison](index.html) · [Rendered board](brand-pack/previews/icon-comparison.png) · [All sizes](brand-pack/previews/contact-sheet.html) · [Decisions and review](brand-pack/decisions.md)

Serve with `python3 -m http.server 57716 --bind 127.0.0.1 --directory design/favicon` for the local review page. The current session's review is at http://127.0.0.1:57716/ .

Canonical editable symbols live in the direction folders; brand-pack/logos keeps the reviewed source set. PNGs and measured bounds are in brand-pack/previews; provenance and hashes in manifest.json. Production masters live in apps/web/public/icons; scripts/make-icons.ts regenerates the versioned outputs.
