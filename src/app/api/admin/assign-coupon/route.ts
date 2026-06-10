import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, eventAttendees, appSettings } from '@/lib/db/schema'
import { reserveCouponForParticipation, recordEmailResult } from '@/lib/db/participation'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'
import { requireUser } from '@/lib/auth/guard'

const schema = z.object({ participation_id: z.number().int().positive() })

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Participation ID is required' }, { status: 400 })
  }

  const [part] = await db
    .select()
    .from(eventAttendees)
    .where(eq(eventAttendees.id, parsed.data.participation_id))
    .limit(1)
  if (!part) {
    return NextResponse.json({ error: 'Attendee not found' }, { status: 404 })
  }
  if (part.couponCodeId) {
    return NextResponse.json({ error: 'Attendee already has a coupon assigned' }, { status: 400 })
  }

  const coupon = await reserveCouponForParticipation(part.id)
  if (!coupon) {
    return NextResponse.json({ error: 'No available coupon codes' }, { status: 400 })
  }

  const [person] = await db.select().from(attendees).where(eq(attendees.id, part.attendeeId)).limit(1)
  const [settings] = await db.select().from(appSettings).limit(1)
  if (person && canSendEmail(settings)) {
    try {
      await sendCouponEmail({
        settings,
        attendee: { name: person.name, email: person.email },
        couponCode: coupon,
        fromName: `Cafe Cursor ${settings.cityName}`,
      })
      await recordEmailResult(part.id, 'sent')
    } catch (e) {
      console.error('email send failed', e)
      await recordEmailResult(part.id, 'failed', e instanceof Error ? e.message : String(e))
    }
  }

  return NextResponse.json({ success: true, code: coupon.code })
}
