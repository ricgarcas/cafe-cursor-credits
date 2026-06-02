import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const rowSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
})
const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(5000) })

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid CSV data' }, { status: 400 })
  }

  const incoming = parsed.data.rows
    .map((r) => ({
      name: r.name.trim(),
      email: r.email.toLowerCase().trim(),
    }))
    // dedupe within the upload
    .filter((r, i, arr) => arr.findIndex((x) => x.email === r.email) === i)

  const emails = incoming.map((r) => r.email)
  const existing = await db
    .select({ email: attendees.email })
    .from(attendees)
    .where(inArray(attendees.email, emails))
  const existingSet = new Set(existing.map((r) => r.email))

  const toInsert = incoming
    .filter((r) => !existingSet.has(r.email))
    .map((r) => ({ ...r, source: 'manual' as const }))

  let inserted = 0
  if (toInsert.length > 0) {
    const rows = await db.insert(attendees).values(toInsert).returning({ id: attendees.id })
    inserted = rows.length
  }

  return NextResponse.json({
    totalRows: parsed.data.rows.length,
    inserted,
    duplicates: parsed.data.rows.length - inserted,
  })
}
