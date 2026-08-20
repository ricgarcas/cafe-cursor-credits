import { describe, it, expect } from 'vitest'
import { eventDayLabel, formatEventDate, parseEventDate, suggestEventName } from './event-date'

describe('parseEventDate', () => {
  it('reads YYYY-MM-DD as a local calendar day, not UTC', () => {
    const d = parseEventDate('2026-08-20')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(20) // would be the 19th west of UTC via new Date()
  })

  it('returns null for empty or unparseable values', () => {
    expect(parseEventDate(null)).toBeNull()
    expect(parseEventDate('')).toBeNull()
    expect(parseEventDate('not a date')).toBeNull()
  })
})

describe('formatEventDate', () => {
  it('formats with and without the year', () => {
    expect(formatEventDate('2026-08-20')).toBe('Aug 20, 2026')
    expect(formatEventDate('2026-08-20', { withYear: false })).toBe('Aug 20')
  })

  it('returns null when there is no date', () => {
    expect(formatEventDate(null)).toBeNull()
  })
})

describe('eventDayLabel', () => {
  const now = new Date(2026, 7, 20)

  it('names the days an organizer cares about', () => {
    expect(eventDayLabel('2026-08-20', now)).toBe('Today')
    expect(eventDayLabel('2026-08-21', now)).toBe('Tomorrow')
    expect(eventDayLabel('2026-08-19', now)).toBe('Yesterday')
    expect(eventDayLabel('2026-08-25', now)).toBe('In 5 days')
    expect(eventDayLabel('2026-08-01', now)).toBe('Past')
  })

  it('stays quiet for dates far in the future', () => {
    expect(eventDayLabel('2026-12-01', now)).toBeNull()
    expect(eventDayLabel(null, now)).toBeNull()
  })
})

describe('suggestEventName', () => {
  it('includes the city and month', () => {
    expect(suggestEventName('CDMX', new Date(2026, 7, 20))).toBe('Cafe Cursor CDMX — August')
  })

  it('falls back to the bare wordmark without a city', () => {
    expect(suggestEventName(undefined, new Date(2026, 7, 20))).toBe('Cafe Cursor — August')
  })
})
