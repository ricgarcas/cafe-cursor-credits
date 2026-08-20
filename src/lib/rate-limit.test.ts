import { describe, it, expect, beforeEach } from 'vitest'
import {
  rateLimit,
  resetRateLimits,
  clientIp,
  VENUE_WINDOWS,
  MCP_WINDOWS,
  OAUTH_WINDOWS,
} from './rate-limit'

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('allows 5 per minute then blocks until the window slides', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) expect(rateLimit('claim:1.2.3.4', t0 + i * 1000)).toBe(true)
    expect(rateLimit('claim:1.2.3.4', t0 + 6000)).toBe(false)
    expect(rateLimit('claim:1.2.3.4', t0 + 61_000)).toBe(true)
  })

  it('enforces the hourly cap within a single rolling hour', () => {
    const t0 = 2_000_000
    let allowed = 0
    // 35 requests 90s apart = ~52 min total, all inside one hour; 90s spacing
    // keeps each rolling minute under the per-minute cap, so only the hourly
    // cap of 30 binds.
    for (let i = 0; i < 35; i++) {
      if (rateLimit('reg:ip', t0 + i * 90_000)) allowed++
    }
    expect(allowed).toBe(30)
  })

  it('keys are independent', () => {
    const t0 = 3_000_000
    for (let i = 0; i < 5; i++) rateLimit('a', t0)
    expect(rateLimit('a', t0)).toBe(false)
    expect(rateLimit('b', t0)).toBe(true)
  })

  it('clientIp takes the first forwarded hop', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })
    expect(clientIp(req)).toBe('9.9.9.9')
  })
})

describe('custom windows', () => {
  it('venue windows allow a room of claims from one IP', () => {
    resetRateLimits()
    const t0 = 4_000_000
    let allowed = 0
    for (let i = 0; i < 40; i++) {
      if (rateLimit('claim:venue-ip', t0 + i * 100, VENUE_WINDOWS)) allowed++
    }
    expect(allowed).toBe(30) // per-minute venue cap, not the default 5
  })

  it('default windows still bind other keys', () => {
    resetRateLimits()
    const t0 = 5_000_000
    let allowed = 0
    for (let i = 0; i < 10; i++) {
      if (rateLimit('login:ip', t0 + i * 100)) allowed++
    }
    expect(allowed).toBe(5)
  })
})

describe('MCP windows', () => {
  it('lets one agent turn fire many tool calls back to back', () => {
    resetRateLimits()
    const t0 = 6_000_000
    let allowed = 0
    // A setup turn is easily a dozen calls in a couple of seconds.
    for (let i = 0; i < 20; i++) {
      if (rateLimit('mcp:cck_live_abcd', t0 + i * 50, MCP_WINDOWS)) allowed++
    }
    expect(allowed).toBe(20)
  })

  it('still bounds a runaway agent loop', () => {
    resetRateLimits()
    const t0 = 7_000_000
    let allowed = 0
    for (let i = 0; i < 100; i++) {
      if (rateLimit('mcp:cck_live_abcd', t0 + i * 50, MCP_WINDOWS)) allowed++
    }
    expect(allowed).toBe(60)
  })
})

describe('OAUTH_WINDOWS', () => {
  it('survives a token exchange plus a burst of refreshes from one IP', () => {
    resetRateLimits()
    const now = Date.now()
    // 5/min (the default) would 429 partway through; a venue NAT makes this
    // the normal case, not an abusive one.
    for (let i = 0; i < 30; i++) {
      expect(rateLimit('token:1.2.3.4', now, OAUTH_WINDOWS)).toBe(true)
    }
    expect(rateLimit('token:1.2.3.4', now, OAUTH_WINDOWS)).toBe(false)
  })

  it('still bounds a runaway client within the hour', () => {
    resetRateLimits()
    const start = Date.now()
    let allowed = 0
    for (let i = 0; i < 400; i++) {
      // Spread across the hour so the per-minute window never binds.
      if (rateLimit('token:5.6.7.8', start + i * 9_000, OAUTH_WINDOWS)) allowed++
    }
    expect(allowed).toBe(300)
  })
})
