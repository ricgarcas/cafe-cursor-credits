/**
 * Minimal RFC 4180-ish CSV parser for attendee imports. Handles quoted fields
 * with embedded commas and escaped quotes. Looks for `name` + `email` columns
 * (case-insensitive); if no header row, assumes first col = name, second = email.
 */

export type AttendeeRow = { name: string; email: string }
export type ParseResult = { rows: AttendeeRow[]; skipped: number; error?: string }

function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        cur += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') {
        out.push(cur)
        cur = ''
      } else cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export function parseAttendeeCsv(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
  if (lines.length === 0) return { rows: [], skipped: 0, error: 'Empty file' }

  const first = splitLine(lines[0]).map((s) => s.toLowerCase())
  const hasHeader = first.includes('email') || first.includes('name')
  const nameIdx = hasHeader ? first.findIndex((h) => h === 'name') : 0
  const emailIdx = hasHeader ? first.findIndex((h) => h === 'email') : 1
  if (nameIdx < 0 || emailIdx < 0) {
    return { rows: [], skipped: 0, error: 'Could not find name/email columns.' }
  }

  const dataLines = hasHeader ? lines.slice(1) : lines
  const rows: AttendeeRow[] = []
  let skipped = 0
  for (const line of dataLines) {
    const cells = splitLine(line)
    const name = cells[nameIdx]?.trim() || ''
    const email = cells[emailIdx]?.trim() || ''
    if (!name || !email || !email.includes('@')) {
      skipped++
      continue
    }
    rows.push({ name, email })
  }
  return { rows, skipped }
}

/**
 * Quote a value for CSV export. Neutralizes spreadsheet formula injection —
 * Excel/Sheets execute cells starting with = + - @ when opened.
 */
export function csvCell(value: unknown): string {
  const s = String(value ?? '')
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${guarded.replace(/"/g, '""')}"`
}
