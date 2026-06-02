import { describe, it, expect } from 'vitest'
import { reorderForCutStack } from './qr-layout'

describe('reorderForCutStack', () => {
  it('preserves sequential order when N items fit on one page', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(reorderForCutStack(items, 9)).toEqual(items)
  })

  it('interleaves across pages so cut-and-stack yields sequential ordering', () => {
    // 27 items over 3 pages of 9: same grid slot across pages gets consecutive
    // numbers, so page 1 slots 1..3 are items 1, 4, 7 (step = number of pages).
    const items = Array.from({ length: 27 }, (_, i) => i + 1)
    const reordered = reorderForCutStack(items, 9)
    // Page 1 (first 9 emitted): 1, 4, 7, 10, 13, 16, 19, 22, 25
    expect(reordered.slice(0, 9)).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25])
    // Page 2 (next 9): 2, 5, 8, 11, 14, 17, 20, 23, 26
    expect(reordered.slice(9, 18)).toEqual([2, 5, 8, 11, 14, 17, 20, 23, 26])
    // Page 3 (last 9): 3, 6, 9, 12, 15, 18, 21, 24, 27
    expect(reordered.slice(18, 27)).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27])
  })

  it('handles incomplete final pages', () => {
    const items = [1, 2, 3, 4, 5] // 1 page of 9, 4 empty slots
    const reordered = reorderForCutStack(items, 9)
    expect(reordered).toHaveLength(5)
    expect(new Set(reordered)).toEqual(new Set(items))
  })

  it('returns empty for empty input', () => {
    expect(reorderForCutStack([], 9)).toEqual([])
  })
})
