import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { eventAttendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { reserveCouponForParticipation } from '@/lib/db/participation'

/** Assigns a fresh code; the old one stays burned — it already left in an email. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { id } = await params
  const participationId = Number(id)
  if (!Number.isFinite(participationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const [row] = await db.select().from(eventAttendees).where(eq(eventAttendees.id, participationId)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const coupon = await reserveCouponForParticipation(participationId)
  if (!coupon) return NextResponse.json({ error: 'No available coupon codes' }, { status: 400 })
  return NextResponse.json({ success: true, code: coupon.code })
}
