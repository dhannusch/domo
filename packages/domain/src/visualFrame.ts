/**
 * The document a Visual runs in, shared by the web app (which shows it) and the
 * daemon (which checks it headlessly first), so both see exactly the same page.
 */

export type VisualTheme = Readonly<Record<string, string>>

/** Domo's palette for visuals; the web app passes its live CSS values instead. */
export const VISUAL_THEMES: { readonly light: VisualTheme; readonly dark: VisualTheme } = {
  light: {
    "--paper": "#ecede8",
    "--paper-deep": "#e1e3dc",
    "--ink": "#23262b",
    "--accent": "#5c7a62",
    "--pencil": "#6a6d70",
    "--margin-rule": "#9db0a0",
  },
  dark: {
    "--paper": "#181b19",
    "--paper-deep": "#202421",
    "--ink": "#daddd6",
    "--accent": "#9bb89f",
    "--pencil": "#8d928c",
    "--margin-rule": "#4e6553",
  },
}

export const VISUAL_TOKENS = Object.keys(VISUAL_THEMES.light)

/** No network at all: inline styles and scripts, data: images and fonts only. */
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:"

/** Reports the document's height to the page, and again whenever asked. */
const SIZER = `<script>(()=>{const send=()=>parent.postMessage({domoVisualHeight:document.documentElement.scrollHeight},"*");new ResizeObserver(send).observe(document.documentElement);addEventListener("load",send);addEventListener("message",(e)=>{if(e.data==="domo:measure")send()});send()})()</script>`

export const visualDocument = (html: string, theme: VisualTheme): string => {
  const vars = Object.entries(theme)
    .map(([name, value]) => `${name}:${value};`)
    .join("")
  const css = `:root{${vars}--font-prose:"Iowan Old Style",Georgia,serif;--font-hand:-apple-system,"Helvetica Neue",sans-serif;color-scheme:light dark}
html,body{margin:0;background:transparent;color:var(--ink);font:16px/1.6 var(--font-prose);overflow:hidden}
*{box-sizing:border-box}svg{max-width:100%}`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body>${html}${SIZER}</body></html>`
}
