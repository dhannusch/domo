const iconDirections = [
  {
    id: "a-d",
    letter: "A",
    name: "Custom d",
    description: "A compact, bespoke monogram. Direct and typographic.",
    risk: "The clearest link to the name; a lowercase initial is a crowded category.",
  },
  {
    id: "b-fold",
    letter: "B",
    name: "Fold",
    description: "A folded note, reduced to one clear gesture.",
    risk: "Quietly distinctive, with a more document-oriented association.",
  },
  {
    id: "c-chat",
    letter: "C",
    name: "Open arch",
    description: "One open, asymmetrical arch. A quieter, more abstract emblem.",
    risk: "Can read as a doorway or an n; the connection to Domo takes longer.",
  },
]
document.getElementById("directions").innerHTML = iconDirections
  .map(
    (d) =>
      `<article class="direction"><h2>${d.letter} · ${d.name}${d.letter === "A" ? '<span class="pick">My pick</span>' : ""}</h2><p class="description">${d.description}</p><div class="app-zone"><img class="app-icon" src="${d.id}/app.svg" alt="${d.name} PWA icon" width="256" height="256"></div><p class="label">Favicon and small-size tests</p><div class="sizes">${[16, 24, 32, 64].map((size) => `<figure><img src="${d.id}/${size <= 32 ? "small" : "symbol"}.svg" alt="${d.name} at ${size}px" width="${size}" height="${size}"><figcaption>${size}px</figcaption></figure>`).join("")}</div><div class="contexts"><div class="tabs"><div class="tab"><img src="${d.id}/small.svg" alt=""><span>Domo</span><span class="close" aria-hidden="true">×</span></div><div class="tab dark"><img src="${d.id}/small-reversed.svg" alt=""><span>Domo</span><span class="close" aria-hidden="true">×</span></div></div><div class="reverse-zone"><img src="${d.id}/reversed.svg" alt="${d.name} reversed at 128px" width="128" height="128"></div></div><p class="risk"><strong>Tradeoff:</strong> ${d.risk}</p><div class="links"><a href="${d.id}/symbol.svg" data-testid="svg-${d.letter}">Source SVG</a><a href="${d.id}/rationale.md" data-testid="rationale-${d.letter}">Rationale</a></div></article>`,
  )
  .join("")
