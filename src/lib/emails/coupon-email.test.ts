import { describe, it, expect } from 'vitest'
import { renderCouponEmail } from './coupon-email'

const base = {
  attendee: { name: 'Ada Lovelace', email: 'ada@example.com' },
  couponCode: { code: 'CFNHNHRUGX1Q' },
}

describe('renderCouponEmail', () => {
  it('greets the attendee by first name only', () => {
    const html = renderCouponEmail(base)
    expect(html).toContain('Hi Ada,')
    expect(html).not.toContain('Lovelace')
  })

  it('shows the raw code', () => {
    expect(renderCouponEmail(base)).toContain('CFNHNHRUGX1Q')
  })

  it('builds a cursor.com/referral redemption link from a bare code', () => {
    const html = renderCouponEmail(base)
    expect(html).toContain('href="https://cursor.com/referral?code=CFNHNHRUGX1Q"')
  })

  it('url-encodes codes with special characters', () => {
    const html = renderCouponEmail({ ...base, couponCode: { code: 'a b/c&d' } })
    expect(html).toContain('href="https://cursor.com/referral?code=a%20b%2Fc%26d"')
  })

  it('passes through a code that is already a full URL', () => {
    const url = 'https://cursor.com/referral?code=ABC123'
    const html = renderCouponEmail({ ...base, couponCode: { code: url } })
    expect(html).toContain(`href="${url}"`)
  })

  it('includes the city in the venue line when provided', () => {
    const html = renderCouponEmail({ ...base, cityName: 'CDMX' })
    expect(html).toContain('Cafe Cursor CDMX')
  })

  it('falls back to plain "Cafe Cursor" without a city', () => {
    const html = renderCouponEmail(base)
    expect(html).toContain('registering for Cafe Cursor.')
  })

  it('produces a complete HTML document', () => {
    const html = renderCouponEmail(base)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('</html>')
  })
})
