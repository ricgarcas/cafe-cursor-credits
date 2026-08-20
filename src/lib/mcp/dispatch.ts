import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, attendees, couponCodes, eventAttendees } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'
import { reserveCouponForParticipation, recordEmailResult } from '@/lib/db/participation'
import { canSendEmail, sendCouponEmail } from '@/lib/emails/send-coupon-email'

export type DispatchScope = 'luma' | 'all_unassigned'

export type DispatchProjection = {
  wouldEmail: number
  wouldBurn: number
  availableCodes: number
  remainingAfter: number
  shortfall: number
  emailConfigured: boolean
}

/** Participations still needing a code or a successful send. */
async function pendingFor(scope: DispatchScope) {
  // MCP requests carry no session cookie — bind to the live event.
  const event = await getActiveEvent()
  const sourceFilter = scope === 'luma' ? sql`AND ${eventAttendees.source} = 'luma'` : sql``
  return db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .where(
      sql`${eventAttendees.eventId} = ${event.id}
          ${sourceFilter}
          AND (${eventAttendees.couponCodeId} IS NULL
               OR ${eventAttendees.emailStatus} IS NULL
               OR ${eventAttendees.emailStatus} != 'sent')`,
    )
}

/** Read-only. Must never write — it backs the dry run. */
export async function projectDispatch(scope: DispatchScope): Promise<DispatchProjection> {
  const [pending, [settings], [available]] = await Promise.all([
    pendingFor(scope),
    db.select().from(appSettings).limit(1),
    db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false)),
  ])
  const availableCodes = Number(available?.c ?? 0)
  const needCode = pending.filter((r) => r.event_attendees.couponCodeId == null).length
  const wouldBurn = Math.min(needCode, availableCodes)
  // Everyone already holding a code still needs mail, plus everyone we can
  // newly supply a code to.
  const alreadyHoldingCode = pending.length - needCode
  return {
    wouldEmail: alreadyHoldingCode + wouldBurn,
    wouldBurn,
    availableCodes,
    remainingAfter: availableCodes - wouldBurn,
    shortfall: Math.max(0, needCode - availableCodes),
    emailConfigured: canSendEmail(settings),
  }
}

export async function runDispatch(scope: DispatchScope) {
  const [pending, [settings]] = await Promise.all([
    pendingFor(scope),
    db.select().from(appSettings).limit(1),
  ])

  let assigned = 0
  let emailed = 0
  let outOfCodes = false
  const failed: { email: string; error: string }[] = []

  for (const row of pending) {
    const participation = row.event_attendees
    const person = row.attendees
    let couponId = participation.couponCodeId

    if (couponId == null) {
      const coupon = await reserveCouponForParticipation(participation.id)
      if (!coupon) {
        outOfCodes = true
        break
      }
      couponId = coupon.id
      assigned++
    }

    if (!canSendEmail(settings)) {
      await recordEmailResult(participation.id, 'skipped')
      continue
    }
    const [coupon] = await db
      .select()
      .from(couponCodes)
      .where(eq(couponCodes.id, couponId))
      .limit(1)
    if (!coupon) continue
    try {
      // Resend allows ~2 req/s — pace bulk sends so big lists don't 429.
      if (emailed > 0) await new Promise((r) => setTimeout(r, 600))
      await sendCouponEmail({
        settings,
        attendee: { name: person.name, email: person.email },
        couponCode: coupon,
        fromName: `Cafe Cursor ${settings.cityName}`,
      })
      await recordEmailResult(participation.id, 'sent')
      emailed++
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      await recordEmailResult(participation.id, 'failed', error)
      failed.push({ email: person.email, error })
    }
  }

  return { assigned, emailed, failed, outOfCodes }
}
