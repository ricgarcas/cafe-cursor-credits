import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const { id } = await params
  const attendeeId = Number(id)
  if (!Number.isFinite(attendeeId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  await db.delete(attendees).where(eq(attendees.id, attendeeId))
  return NextResponse.json({ success: true })
}
