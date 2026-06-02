import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, appSettings } from '@/lib/db/schema'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'
import { requireUser } from '@/lib/auth/guard'

const schema = z.object({ attendeeId: z.number().int().positive() })

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Attendee ID is required' }, { status: 400 })
  }
  const { attendeeId } = parsed.data

  const [attendee] = await db
    .select()
    .from(attendees)
    .where(eq(attendees.id, attendeeId))
    .limit(1)
  if (!attendee) {
    return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
  }
  if (attendee.couponCodeId) {
    return NextResponse.json({ error: 'Attendee already has a coupon assigned' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const [coupon] = await db
    .update(couponCodes)
    .set({
      isUsed: true,
      usedAt: now,
      usedByType: 'attendee',
      updatedAt: now,
    })
    .where(
      sql`${couponCodes.id} = (
        SELECT id FROM ${couponCodes}
        WHERE ${couponCodes.isUsed} = 0 AND ${couponCodes.usedAt} IS NULL
        LIMIT 1
      )`,
    )
    .returning()

  if (!coupon) {
    return NextResponse.json({ error: 'No available coupon codes' }, { status: 400 })
  }

  await db
    .update(attendees)
    .set({ couponCodeId: coupon.id, updatedAt: now })
    .where(eq(attendees.id, attendeeId))

  const [settings] = await db.select().from(appSettings).limit(1)
  if (canSendEmail(settings)) {
    try {
      await sendCouponEmail({
        settings,
        attendee,
        couponCode: coupon,
        fromName: `Cafe Cursor ${settings.cityName}`,
      })
    } catch (e) {
      console.error('email send failed', e)
    }
  }

  return NextResponse.json({ success: true })
}
