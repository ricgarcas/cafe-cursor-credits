import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { lumaEvents, lumaGuests, attendees, couponCodes, appSettings, eventAttendees, events } from '@/lib/db/schema'
import { listAllEvents, listAllGuests, type LumaGuest } from './client'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'
import {
  findOrCreatePerson,
  getParticipation,
  createParticipation,
  reserveCouponForParticipation,
  recordEmailResult,
} from '@/lib/db/participation'

/**
 * Luma sets `approval_status` only on approval-gated events; open events leave
 * it null and those guests always qualify. On gated events we must wait for the
 * host — never hand credits to guests still pending or already declined.
 */
const BLOCKED_APPROVAL = new Set(['pending_approval', 'declined'])
function isApprovedForCredit(approvalStatus?: string | null) {
  return !approvalStatus || !BLOCKED_APPROVAL.has(approvalStatus)
}

/**
 * Refresh the local cache of Luma events from the API. Idempotent. Does NOT
 * pull guests — that's a separate step so the button in the UI is fast.
 */
export async function refreshLumaEvents(apiKey: string, calendarApiId?: string) {
  const { events, truncated } = await listAllEvents(apiKey, calendarApiId)
  const now = new Date().toISOString()
  let upserted = 0
  for (const ev of events) {
    const existing = await db
      .select({ id: lumaEvents.id })
      .from(lumaEvents)
      .where(eq(lumaEvents.apiId, ev.api_id))
      .limit(1)

    const row = {
      apiId: ev.api_id,
      name: ev.name,
      startAt: ev.start_at ?? null,
      endAt: ev.end_at ?? null,
      timezone: ev.timezone ?? null,
      url: ev.url ?? null,
      coverUrl: ev.cover_url ?? null,
      guestCount: ev.guest_count ?? 0,
      locationName: ev.location?.place?.name ?? null,
      locationAddress:
        ev.location?.place?.address ?? ev.geo_address_info?.full_address ?? null,
      updatedAt: now,
    }

    if (existing[0]) {
      await db.update(lumaEvents).set(row).where(eq(lumaEvents.id, existing[0].id))
    } else {
      await db.insert(lumaEvents).values({ ...row, isSyncEnabled: false })
    }
    upserted++
  }
  return { upserted, truncated }
}

/**
 * Pull all guests for an event from Luma, upsert into `luma_guests` by api_id,
 * and mirror confirmed+approved guests into the `attendees` table so they
 * show up in the main dashboard.
 *
 * Does NOT assign coupons or send emails — that's `dispatchLumaCoupons`.
 */
export async function syncLumaGuests(apiKey: string, eventApiId: string, localEventId: number) {
  const { guests: fetched, truncated } = await listAllGuests(apiKey, eventApiId)
  const now = new Date().toISOString()

  let upserted = 0
  let mirrored = 0

  for (const g of fetched) {
    await upsertGuest(g, eventApiId, now)
    upserted++

    // Mirror confirmed, credit-eligible guests as participations of the local
    // event. Skip waitlist/declined/cancelled and anyone still pending host
    // approval on gated events.
    if (g.registration_status === 'confirmed' && isApprovedForCredit(g.approval_status)) {
      const person = await findOrCreatePerson({ name: g.name, email: g.email })
      let participation = await getParticipation(localEventId, person.id)
      if (!participation) {
        participation = await createParticipation({
          eventId: localEventId,
          attendeeId: person.id,
          source: 'luma',
          lumaGuestId: g.api_id,
          registeredAt: g.created_at ?? now,
        })
        mirrored++
      }
      // Luma marked them present; never clobber an earlier manual check-in.
      if (g.attendance_status && !participation.checkedInAt) {
        await db
          .update(eventAttendees)
          .set({ checkedInAt: now, updatedAt: now })
          .where(eq(eventAttendees.id, participation.id))
      }
    }
  }

  await db
    .update(lumaEvents)
    .set({ lastSyncedAt: now, isSyncEnabled: true, updatedAt: now })
    .where(eq(lumaEvents.apiId, eventApiId))
  // Persist the Luma ↔ local event link so re-syncs and dispatch find it.
  await db
    .update(events)
    .set({ lumaEventApiId: eventApiId, updatedAt: now })
    .where(eq(events.id, localEventId))

  return { upserted, mirrored, truncated }
}

async function upsertGuest(g: LumaGuest, eventApiId: string, now: string) {
  const existing = await db
    .select({ id: lumaGuests.id })
    .from(lumaGuests)
    .where(eq(lumaGuests.apiId, g.api_id))
    .limit(1)

  const row = {
    apiId: g.api_id,
    eventApiId,
    name: g.name,
    email: g.email.toLowerCase(),
    registrationStatus: g.registration_status,
    approvalStatus: g.approval_status ?? null,
    attendanceStatus: g.attendance_status ?? null,
    registeredAt: g.created_at ?? null,
    syncedAt: now,
    updatedAt: now,
  }

  if (existing[0]) {
    await db.update(lumaGuests).set(row).where(eq(lumaGuests.id, existing[0].id))
  } else {
    await db.insert(lumaGuests).values(row)
  }
}

/**
 * For every Luma-sourced participation of the local event, ensure a coupon is
 * assigned and the credit email is sent. Idempotent and retry-safe:
 *   • person+event resolves to one participation, so a code claimed on the
 *     website or at /claim is reused — the same person never gets two.
 *   • a participation whose last send failed (or never ran) is re-attempted.
 * Returns counts for the UI.
 */
export async function dispatchLumaCoupons(localEventId: number) {
  const [settings] = await db.select().from(appSettings).limit(1)

  // Luma-sourced participations of this event needing a coupon or a (re)send —
  // emailStatus != 'sent' keeps failed sends retryable instead of stranded.
  const pending = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .where(
      sql`${eventAttendees.eventId} = ${localEventId}
          AND ${eventAttendees.source} = 'luma'
          AND (${eventAttendees.couponCodeId} IS NULL
               OR ${eventAttendees.emailStatus} IS NULL
               OR ${eventAttendees.emailStatus} = 'failed')`,
    )

  let assigned = 0
  let emailed = 0

  for (const row of pending) {
    const participation = row.event_attendees
    const person = row.attendees
    let couponId = participation.couponCodeId

    if (couponId == null) {
      const coupon = await reserveCouponForParticipation(participation.id)
      if (!coupon) break // out of codes
      couponId = coupon.id
      assigned++
    }

    if (participation.emailStatus !== 'sent') {
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
        await sendCouponEmail({
          settings,
          attendee: { name: person.name, email: person.email },
          couponCode: coupon,
          fromName: `Cafe Cursor ${settings.cityName}`,
        })
        await recordEmailResult(participation.id, 'sent')
        emailed++
      } catch (e) {
        console.error('luma dispatch send failed for', person.email, e)
        await recordEmailResult(participation.id, 'failed', e instanceof Error ? e.message : String(e))
      }
    }
  }

  return { assigned, emailed, pending: pending.length }
}
