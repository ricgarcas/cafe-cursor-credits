import { describe, it, expect } from 'vitest'
import { maskSecret, isUnchanged, UNCHANGED } from './secrets'

describe('maskSecret', () => {
  it('returns null for missing values', () => {
    expect(maskSecret(null)).toBeNull()
    expect(maskSecret('')).toBeNull()
    expect(maskSecret(undefined)).toBeNull()
  })

  it('preserves dashed prefix like "secret-"', () => {
    const masked = maskSecret('secret-abcdef1234567890SQZRLLV')
    expect(masked?.startsWith('secret-')).toBe(true)
    expect(masked?.endsWith('RLLV')).toBe(true)
    expect(masked).toMatch(/^secret-•+[A-Z]{4}$/)
  })

  it('preserves underscore prefix like "re_"', () => {
    const masked = maskSecret('re_abcdef1234567890xyz9')
    expect(masked?.startsWith('re_')).toBe(true)
    expect(masked?.endsWith('xyz9')).toBe(true)
  })

  it('falls back to bullets for short values', () => {
    expect(maskSecret('short')).toBe('••••••••')
  })
})

describe('isUnchanged', () => {
  it('accepts the sentinel', () => {
    expect(isUnchanged(UNCHANGED)).toBe(true)
  })

  it('accepts a mask pattern echoed back from the client', () => {
    expect(isUnchanged('secret-••••••••••••LLLV')).toBe(true)
    expect(isUnchanged('re_••••••••••••xyz9')).toBe(true)
  })

  it('rejects real-looking API keys', () => {
    expect(isUnchanged('secret-abcdef1234567890')).toBe(false)
    expect(isUnchanged('re_1234567890abcdef')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isUnchanged(null)).toBe(false)
    expect(isUnchanged(undefined)).toBe(false)
    expect(isUnchanged(42)).toBe(false)
  })
})
