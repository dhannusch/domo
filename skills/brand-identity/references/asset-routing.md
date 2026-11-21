# Asset routing

Choose the least lossy and most inspectable format that matches the request.

| Request | Canonical source | Preview or delivery |
| --- | --- | --- |
| Logo or icon | SVG | PNG contact sheet plus SVG file |
| Wordmark | SVG with font/license record | PNG at real use sizes |
| Social card or cover | HTML/CSS or SVG | PNG via `snapshot_html` |
| Brand book | Self-contained HTML | PNG sections plus HTML |
| Photo or texture | Licensed source or recorded image backend | PNG/JPEG/WebP |

Static images belong in `attach_image`; `render_visual` is for interactive explainers, not final
brand artwork. Keep external URLs out of canonical assets unless the user explicitly wants a hosted
dependency.
