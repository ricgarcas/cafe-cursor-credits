import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSelectedEvent } from '@/lib/db/events'
import { findOrCreatePerson, getParticipation, createParticipation } from '@/lib/db/participation'
import { requireUser } from '@/lib/auth/guard'

const rowSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
})
const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(5000) })

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid CSV data' }, { status: 400 })
  }

  const event = await getSelectedEvent()

  const incoming = parsed.data.rows
    .map((r) => ({ name: r.name.trim(), email: r.email.toLowerCase().trim() }))
    // dedupe within the upload
    .filter((r, i, arr) => arr.findIndex((x) => x.email === r.email) === i)

  let inserted = 0
  for (const r of incoming) {
    const person = await findOrCreatePerson(r)
    if (await getParticipation(event.id, person.id)) continue // already in this event
    await createParticipation({ eventId: event.id, attendeeId: person.id, source: 'manual' })
    inserted++
  }

  return NextResponse.json({
    totalRows: parsed.data.rows.length,
    inserted,
    duplicates: parsed.data.rows.length - inserted,
  })
}
