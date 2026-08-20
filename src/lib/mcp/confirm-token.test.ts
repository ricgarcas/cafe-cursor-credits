import { describe, it, expect, beforeEach } from 'vitest'
import {
  issueConfirmToken,
  consumeConfirmToken,
  resetConfirmTokens,
  CONFIRM_TOKEN_TTL_MS,
} from './confirm-token'

const ARGS = { scope: 'luma' }

describe('confirm tokens', () => {
  beforeEach(() => resetConfirmTokens())

  it('issues a dr_-prefixed token', () => {
    expect(issueConfirmToken('dispatch_codes', ARGS)).toMatch(/^dr_/)
  })

  it('accepts a matching token once', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'dispatch_codes', ARGS)).toEqual({ ok: true })
  })

  it('rejects reuse of a consumed token', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    consumeConfirmToken(t, 'dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'dispatch_codes', ARGS)).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('rejects an unknown token', () => {
    expect(consumeConfirmToken('dr_nope', 'dispatch_codes', ARGS)).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('rejects an expired token', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS, 1_000)
    const later = 1_000 + CONFIRM_TOKEN_TTL_MS + 1
    expect(consumeConfirmToken(t, 'dispatch_codes', ARGS, later)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('rejects when the arguments changed', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'dispatch_codes', { scope: 'all_unassigned' })).toEqual({
      ok: false,
      reason: 'args_changed',
    })
  })

  it('rejects when the tool name changed', () => {
    const t = issueConfirmToken('dispatch_codes', ARGS)
    expect(consumeConfirmToken(t, 'resend_failed', ARGS)).toEqual({
      ok: false,
      reason: 'args_changed',
    })
  })

  it('ignores dry_run and confirm_token when fingerprinting', () => {
    const t = issueConfirmToken('dispatch_codes', { scope: 'luma', dry_run: true })
    expect(
      consumeConfirmToken(t, 'dispatch_codes', {
        scope: 'luma',
        dry_run: false,
        confirm_token: t,
      }),
    ).toEqual({ ok: true })
  })
})
