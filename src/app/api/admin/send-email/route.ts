import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
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

  const [settings] = await db.select().from(appSettings).limit(1)
  if (!canSendEmail(settings)) {
    return NextResponse.json(
      { error: 'Email provider is not fully configured. Please set it up in Settings.' },
      { status: 400 },
    )
  }

  const [attendee] = await db
    .select()
    .from(attendees)
    .where(eq(attendees.id, parsed.data.attendeeId))
    .limit(1)
  if (!attendee) {
    return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
  }
  if (!attendee.couponCodeId) {
    return NextResponse.json(
      { error: 'Attendee does not have a coupon assigned' },
      { status: 400 },
    )
  }

  const [coupon] = await db
    .select()
    .from(couponCodes)
    .where(eq(couponCodes.id, attendee.couponCodeId))
    .limit(1)
  if (!coupon) {
    return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
  }

  try {
    await sendCouponEmail({
      settings,
      attendee,
      couponCode: coupon,
      fromName: `Cafe Cursor ${settings.cityName}`,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('send-email error', e)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
