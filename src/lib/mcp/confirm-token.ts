import { createHash, randomBytes } from 'crypto'

export const CONFIRM_TOKEN_TTL_MS = 300_000 // 5 minutes

// In-memory on purpose, matching the rate limiter: this app runs as one
// process. Multi-instance deploys need a shared store.
const tokens = new Map<string, { fingerprint: string; expiresAt: number }>()

/** `dry_run` and `confirm_token` are handshake plumbing, not intent. */
function fingerprint(toolName: string, args: unknown): string {
  const rest = { ...(args as Record<string, unknown>) }
  delete rest.dry_run
  delete rest.confirm_token
  const stable = JSON.stringify(rest, Object.keys(rest).sort())
  return createHash('sha256').update(`${toolName}:${stable}`).digest('hex')
}

export function issueConfirmToken(toolName: string, args: unknown, now = Date.now()): string {
  const token = `dr_${randomBytes(12).toString('hex')}`
  tokens.set(token, {
    fingerprint: fingerprint(toolName, args),
    expiresAt: now + CONFIRM_TOKEN_TTL_MS,
  })
  return token
}

export function consumeConfirmToken(
  token: string,
  toolName: string,
  args: unknown,
  now = Date.now(),
): { ok: true } | { ok: false; reason: 'unknown' | 'expired' | 'args_changed' } {
  const entry = tokens.get(token)
  if (!entry) return { ok: false, reason: 'unknown' }
  if (now > entry.expiresAt) {
    tokens.delete(token)
    return { ok: false, reason: 'expired' }
  }
  if (entry.fingerprint !== fingerprint(toolName, args)) {
    return { ok: false, reason: 'args_changed' }
  }
  tokens.delete(token) // single use
  return { ok: true }
}

export function resetConfirmTokens() {
  tokens.clear()
}
