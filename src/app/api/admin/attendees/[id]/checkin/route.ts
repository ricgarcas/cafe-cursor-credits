import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { eventAttendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const participationId = Number(id)
  const parsed = z.object({ checked_in: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success || !Number.isFinite(participationId)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const [row] = await db
    .update(eventAttendees)
    .set({ checkedInAt: parsed.data.checked_in ? now : null, updatedAt: now })
    .where(eq(eventAttendees.id, participationId))
    .returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true, checked_in_at: row.checkedInAt })
}
