import { describe, it, expect } from 'vitest'
import { parseAttendeeCsv } from './csv'

describe('parseAttendeeCsv', () => {
  it('parses a headered CSV', () => {
    const text = 'name,email\nAda Lovelace,ada@example.com\nAlan Turing,alan@example.com\n'
    const result = parseAttendeeCsv(text)
    expect(result.error).toBeUndefined()
    expect(result.rows).toEqual([
      { name: 'Ada Lovelace', email: 'ada@example.com' },
      { name: 'Alan Turing', email: 'alan@example.com' },
    ])
    expect(result.skipped).toBe(0)
  })

  it('handles reversed header order', () => {
    const text = 'email,name\nada@example.com,Ada Lovelace\n'
    const result = parseAttendeeCsv(text)
    expect(result.rows).toEqual([{ name: 'Ada Lovelace', email: 'ada@example.com' }])
  })

  it('falls back to positional columns when no header', () => {
    const text = 'Ada Lovelace,ada@example.com\nAlan Turing,alan@example.com\n'
    const result = parseAttendeeCsv(text)
    expect(result.rows).toHaveLength(2)
  })

  it('ignores extra columns', () => {
    const text = 'name,email,company\nAda,ada@x.com,Bletchley\n'
    const result = parseAttendeeCsv(text)
    expect(result.rows).toEqual([{ name: 'Ada', email: 'ada@x.com' }])
  })

  it('handles quoted fields with embedded commas', () => {
    const text = 'name,email\n"Lovelace, Ada",ada@example.com\n'
    const result = parseAttendeeCsv(text)
    expect(result.rows[0].name).toBe('Lovelace, Ada')
  })

  it('handles escaped quotes inside quoted fields', () => {
    const text = 'name,email\n"Ada ""the Countess"" Lovelace",ada@example.com\n'
    const result = parseAttendeeCsv(text)
    expect(result.rows[0].name).toBe('Ada "the Countess" Lovelace')
  })

  it('skips invalid rows and reports count', () => {
    const text = 'name,email\nAda,ada@example.com\n,missing@example.com\nNoEmail,\nBadEmail,not-an-email\n'
    const result = parseAttendeeCsv(text)
    expect(result.rows).toHaveLength(1)
    expect(result.skipped).toBe(3)
  })

  it('handles CRLF line endings', () => {
    const text = 'name,email\r\nAda,ada@x.com\r\nAlan,alan@x.com\r\n'
    const result = parseAttendeeCsv(text)
    expect(result.rows).toHaveLength(2)
  })

  it('returns an error for empty files', () => {
    expect(parseAttendeeCsv('').error).toBe('Empty file')
  })
})
