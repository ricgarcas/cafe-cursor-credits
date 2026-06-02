import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('supports conditional object syntax', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })

  it('merges conflicting tailwind utilities, last wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-sm text-red-500', 'text-lg')).toBe('text-red-500 text-lg')
  })

  it('flattens arrays', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })
})
