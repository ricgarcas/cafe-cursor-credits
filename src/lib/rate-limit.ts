import { NextResponse } from 'next/server'

// In-memory on purpose: this app runs as one process (Railway/Fly). If it ever
// goes multi-instance, swap the Map for a shared store.
export type RateWindow = { limit: number; windowMs: number }

const DEFAULT_WINDOWS: RateWindow[] = [
  { limit: 5, windowMs: 60_000 },
  { limit: 30, windowMs: 3_600_000 },
]

// A whole event claims from one venue IP — per-IP limits must fit a room, not
// a person. Pair with a per-email limit for per-person abuse.
export const VENUE_WINDOWS: RateWindow[] = [
  { limit: 30, windowMs: 60_000 },
  { limit: 300, windowMs: 3_600_000 },
]

// One agent turn ("set up my city") fires several tool calls back to back, so
// human-sized windows would 429 mid-setup. Still bounded against a runaway loop.
export const MCP_WINDOWS: RateWindow[] = [
  { limit: 60, windowMs: 60_000 },
  { limit: 600, windowMs: 3_600_000 },
]

// Token exchange, hourly refreshes and retries all land here, and a venue NAT
// puts every organizer on one IP — 5/min locks out real use. The secrets being
// guarded are 256-bit, so brute force is not what this limit is for; it exists
// to bound a misbehaving client.
export const OAUTH_WINDOWS: RateWindow[] = [
  { limit: 30, windowMs: 60_000 },
  { limit: 300, windowMs: 3_600_000 },
]

const hits = new Map<string, number[]>()

export function rateLimit(key: string, now = Date.now(), windows: RateWindow[] = DEFAULT_WINDOWS): boolean {
  const horizon = Math.max(...windows.map((w) => w.windowMs))
  const stamps = (hits.get(key) ?? []).filter((t) => now - t < horizon)
  const allowed = windows.every(
    (w) => stamps.filter((t) => now - t < w.windowMs).length < w.limit,
  )
  if (allowed) stamps.push(now)
  // Evict fully-expired keys so the Map can't grow unbounded under abuse.
  if (stamps.length === 0) hits.delete(key)
  else hits.set(key, stamps)
  return allowed
}

export function resetRateLimits() {
  hits.clear()
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests — please wait a moment and try again.' },
    { status: 429 },
  )
}
