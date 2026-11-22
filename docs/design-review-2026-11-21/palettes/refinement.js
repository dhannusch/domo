// Keep the existing component handlers and semantics; simplify visual presentation only.
const sourceButton = document.querySelector('[data-testid="source-view"]')
if (sourceButton) sourceButton.textContent = 'From Wednesday · View'
const replyButton = document.querySelector('[data-testid="reply"]')
if (replyButton) replyButton.textContent = 'Reply'
