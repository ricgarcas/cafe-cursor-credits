/**
 * Event dates are stored as plain `YYYY-MM-DD` strings — no time, no zone.
 * Parsing them with `new Date()` would shift the day backwards for anyone
 * west of UTC, so build a local date explicitly.
 */
export function parseEventDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** "Aug 20, 2026" — or null when the event has no date yet. */
export function formatEventDate(
  value: string | null | undefined,
  opts: { withYear?: boolean } = {},
): string | null {
  const d = parseEventDate(value)
  if (!d) return null
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(opts.withYear === false ? {} : { year: 'numeric' }),
  })
}

/** Relative day framing an organizer actually cares about on event day. */
export function eventDayLabel(value: string | null | undefined, now = new Date()): string | null {
  const d = parseEventDate(value)
  if (!d) return null
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const days = Math.round(
    (startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000,
  )
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1 && days <= 14) return `In ${days} days`
  if (days < -1) return 'Past'
  return null
}

/** Suggests "Cafe Cursor CDMX — August" for a new edition. */
export function suggestEventName(city: string | undefined, date = new Date()): string {
  const base = city && city.trim() ? `Cafe Cursor ${city.trim()}` : 'Cafe Cursor'
  return `${base} — ${date.toLocaleDateString('en-US', { month: 'long' })}`
}
