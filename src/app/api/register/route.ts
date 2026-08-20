import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
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
})

export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(`register:${clientIp(request)}`, Date.now(), VENUE_WINDOWS)) return tooManyRequests()
    const body = await request.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const { name, email } = parsed.data
    if (!rateLimit(`register-email:${email.toLowerCase()}`)) return tooManyRequests()

    const event = await getActiveEvent()
    const person = await findOrCreatePerson({ name, email })

    // Duplicate check is per-event: returning people register fresh next time.
    if (await getParticipation(event.id, person.id)) {
      return NextResponse.json(
        { error: 'This email is already registered' },
        { status: 400 },
      )
    }

    const participation = await createParticipation({
      eventId: event.id,
      attendeeId: person.id,
      source: 'website',
    })

    const coupon = await reserveCouponForParticipation(participation.id)
    let couponAssigned = false
    let emailStatus: 'sent' | 'failed' | 'skipped' | null = null

    if (coupon) {
      couponAssigned = true
      const [settings] = await db.select().from(appSettings).limit(1)
      if (canSendEmail(settings)) {
        try {
          await sendCouponEmail({
            settings,
            attendee: { name: person.name, email: person.email },
            couponCode: coupon,
            fromName: `Cafe Cursor ${settings.cityName}`,
          })
          await recordEmailResult(participation.id, 'sent')
          emailStatus = 'sent'
        } catch (e) {
          console.error('email send failed', e)
          await recordEmailResult(participation.id, 'failed', e instanceof Error ? e.message : String(e))
          emailStatus = 'failed'
        }
      } else {
        await recordEmailResult(participation.id, 'skipped')
        emailStatus = 'skipped'
      }
    }

    // Never claim "check your email" unless the send actually succeeded.
    return NextResponse.json({
      success: true,
      couponAssigned,
      emailStatus,
      message:
        couponAssigned && emailStatus === 'sent'
          ? 'Registration successful! Check your email for your code.'
          : couponAssigned
            ? 'Registration successful! A code is reserved for you.'
            : 'Registration successful!',
    })
  } catch (e) {
    console.error('register error', e)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
