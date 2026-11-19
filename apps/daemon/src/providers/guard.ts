/**
 * Guarded actions (constitution.md): these always need the user's approval
 * through ask_user first, however autonomous Domo otherwise is. Matching is on
 * the shell command a tool is about to run.
 */
export const GUARDED: ReadonlyArray<{ readonly action: string; readonly pattern: RegExp }> = [
  { action: "git push", pattern: /\bgit\b[^;|&\n]*\spush\b/ },
  {
    action: "publish",
    pattern: /\b(npm|pnpm|bun|yarn)\s+publish\b|\bcargo\s+publish\b|\bgh\s+release\b/,
  },
  {
    action: "deploy",
    pattern:
      /\b(wrangler|vercel|netlify|flyctl|fly|firebase|railway|heroku)\b[^|;&]*\b(deploy|publish|release)\b|\bgh\s+pr\s+merge\b/,
  },
  { action: "delete files", pattern: /\brm\s+(-\S*[rRf]\S*\s+)/ },
  {
    action: "system settings",
    pattern: /\bsudo\b|\blaunchctl\b|\bdefaults\s+write\b|\bosascript\b|\bchmod\s+-R\b/,
  },
  {
    action: "send outside",
    pattern:
      /\bcurl\b[^|;&]*(-X\s*(POST|PUT|PATCH|DELETE)|--data\b|\s-d\s)|\b(ssh|scp|rsync|sendmail)\s/,
  },
]

/** Quoted text (commit messages, JSON bodies) is data, not commands, so it can't trigger a guard. */
const withoutQuotes = (command: string) => command.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, "''")

/** The guarded action a shell command would perform, if any. */
export const classifyCommand = (command: string): string | undefined => {
  const bare = withoutQuotes(command)
  return GUARDED.find((g) => g.pattern.test(bare))?.action
}

/** The refusal the model sees; subagents can't ask the user, so they report back instead. */
export const approvalNeeded = (action: string, canAsk: boolean) =>
  canAsk
    ? `This needs the user's approval first (${action}). Call the domo ask_user tool with action ` +
      `"${action}", say exactly what you'll run and why, and retry only if they approve.`
    : `This needs the user's approval (${action}). Don't do it; report back that it needs approval and why.`
