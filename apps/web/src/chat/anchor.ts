/** The first message row on screen, and where its top edge is. */
export const captureAnchor = (): { readonly id: string; readonly top: number } | undefined => {
  for (const row of document.querySelectorAll<HTMLElement>("[data-row-id]")) {
    const rect = row.getBoundingClientRect()
    if (rect.bottom > 0) {
      const id = row.dataset.rowId
      return id === undefined ? undefined : { id, top: rect.top }
    }
  }
  return undefined
}

/** Scrolls so the anchored row sits exactly where it was. */
export const restoreAnchor = (anchor: { readonly id: string; readonly top: number }) => {
  const row = document.querySelector<HTMLElement>(`[data-row-id="${anchor.id}"]`)
  if (row !== null) window.scrollBy({ top: row.getBoundingClientRect().top - anchor.top })
}
