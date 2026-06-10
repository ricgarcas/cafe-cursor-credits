import { NextResponse } from 'next/server'

// In-memory on purpose: this app runs as one process (Railway/Fly). If it ever
// goes multi-instance, swap the Map for a shared store.
const WINDOWS = [
  { limit: 5, windowMs: 60_000 },
  { limit: 30, windowMs: 3_600_000 },
]
const hits = new Map<string, number[]>()

export function rateLimit(key: string, now = Date.now()): boolean {
  const stamps = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000)
  const allowed = WINDOWS.every(
    (w) => stamps.filter((t) => now - t < w.windowMs).length < w.limit,
  )
  if (allowed) stamps.push(now)
  hits.set(key, stamps)
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
