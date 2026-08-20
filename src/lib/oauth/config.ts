import { getPublicOrigin } from 'mcp-handler'

export const SCOPE_READ = 'cafecursor:read'
export const SCOPE_WRITE = 'cafecursor:write'
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const

export type Scope = (typeof SUPPORTED_SCOPES)[number]

/** Read tools are free; everything that mutates or emails needs write. */
export const READ_TOOLS = [
  'readiness_check',
  'event_status',
  'find_attendee',
  'export_attendees',
] as const

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000 // 1h
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30d
export const AUTH_CODE_TTL_MS = 60 * 1000 // 60s — spec says short

/**
 * Public origin of this deployment.
 *
 * `getPublicOrigin` reads X-Forwarded-Host/Proto, which covers Vercel, Fly and
 * nginx. PUBLIC_URL is the escape hatch for proxies that strip them — without
 * it, a stripped header would mint tokens with an internal-hostname audience
 * that then fail to validate against the public one.
 */
export function publicOrigin(request: Request): string {
  const override = process.env.PUBLIC_URL?.trim()
  if (override) return override.replace(/\/+$/, '')
  return getPublicOrigin(request).replace(/\/+$/, '')
}

/** Canonical MCP resource URI — the audience every token is bound to. */
export function canonicalResource(request: Request): string {
  return `${publicOrigin(request)}/api/mcp`
}

/**
 * RFC 8707 resource identifiers must match exactly, but a trailing slash is a
 * common client-side accident and carries no meaning here, so it is tolerated.
 */
export function resourceMatches(a: string | null | undefined, b: string): boolean {
  if (!a) return false
  const norm = (s: string) => s.replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** Normalises a space-delimited scope string to the subset we support. */
export function parseScopes(raw: string | null | undefined): Scope[] {
  if (!raw) return []
  const parts = raw.split(/[\s+]+/).filter(Boolean)
  return SUPPORTED_SCOPES.filter((s) => parts.includes(s))
}

export function hasScope(granted: string, needed: Scope): boolean {
  return parseScopes(granted).includes(needed)
}

/** Which scope a tool call requires. */
export function scopeForTool(toolName: string): Scope {
  return (READ_TOOLS as readonly string[]).includes(toolName) ? SCOPE_READ : SCOPE_WRITE
}
