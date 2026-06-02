/**
 * Cut-and-stack numbering: when printing N pages of `perPage` cards each,
 * items across the same grid slot of every page become consecutive. After
 * printing, cut + stack each position and you get 1,2,3,… with no sorting.
 */
export function reorderForCutStack<T>(items: T[], perPage: number): T[] {
  const pages = Math.ceil(items.length / perPage)
  const out: T[] = []
  for (let p = 0; p < pages; p++) {
    for (let slot = 0; slot < perPage; slot++) {
      const idx = slot * pages + p
      if (items[idx] !== undefined) out.push(items[idx])
    }
  }
  return out
}
