import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, couponCodes } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'
import {
  findOrCreatePerson,
  getParticipation,
  createParticipation,
  reserveCouponForParticipation,
  recordEmailResult,
} from '@/lib/db/participation'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'
import { rateLimit, clientIp, tooManyRequests, VENUE_WINDOWS } from '@/lib/rate-limit'

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  sendEmail: z.boolean().optional().default(false),
  passcode: z.string().max(32).optional(),
})

/** Self-service on-site claim. Idempotent per email per event. */
export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`claim:${clientIp(request)}`, Date.now(), VENUE_WINDOWS)) return tooManyRequests()
    const body = await request.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const { name, email, sendEmail } = parsed.data
    if (!rateLimit(`claim-email:${email.toLowerCase()}`)) return tooManyRequests()

    const [settings] = await db.select().from(appSettings).limit(1)
    if (settings && !settings.claimEnabled) {
      return NextResponse.json({ error: 'The claim portal is currently closed.' }, { status: 403 })
    }

    const event = await getActiveEvent()

    if (event.claimPasscode) {
      const given = parsed.data.passcode?.trim().toLowerCase()
      if (!given || given !== event.claimPasscode.toLowerCase()) {
        return NextResponse.json({ error: 'Wrong event passcode — check the screen at the venue.' }, { status: 403 })
      }
    }

    const person = await findOrCreatePerson({ name, email })

    let participation = await getParticipation(event.id, person.id)
    if (participation?.couponCodeId) {
      const [existingCode] = await db
        .select()
        .from(couponCodes)
        .where(eq(couponCodes.id, participation.couponCodeId))
        .limit(1)
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        code: existingCode?.code ?? null,
        attendee: { name: person.name, email: person.email },
      })
    }

    if (!participation) {
      participation = await createParticipation({
        eventId: event.id,
        attendeeId: person.id,
        source: 'website',
      })
    }

    const coupon = await reserveCouponForParticipation(participation.id)
    if (!coupon) {
      return NextResponse.json({ success: true, code: null, outOfCodes: true })
    }

    if (sendEmail && canSendEmail(settings)) {
      try {
        await sendCouponEmail({
          settings: settings!,
          attendee: { name: person.name, email: person.email },
          couponCode: coupon,
          fromName: `Cafe Cursor ${settings!.cityName}`,
        })
        await recordEmailResult(participation.id, 'sent')
      } catch (e) {
        console.error('email send failed', e)
        await recordEmailResult(participation.id, 'failed', e instanceof Error ? e.message : String(e))
      }
    }

    return NextResponse.json({
      success: true,
      code: coupon.code,
      attendee: { name: person.name, email: person.email },
    })
  } catch (e) {
    console.error('claim error', e)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
