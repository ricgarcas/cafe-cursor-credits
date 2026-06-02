import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { lumaEvents, lumaGuests, attendees, couponCodes, appSettings } from '@/lib/db/schema'
import { listAllEvents, listAllGuests, type LumaGuest } from './client'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'

/**
 * Refresh the local cache of Luma events from the API. Idempotent. Does NOT
 * pull guests — that's a separate step so the button in the UI is fast.
 */
export async function refreshLumaEvents(apiKey: string, calendarApiId?: string) {
  const events = await listAllEvents(apiKey, calendarApiId)
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
  return { upserted }
}

/**
 * Pull all guests for an event from Luma, upsert into `luma_guests` by api_id,
 * and mirror confirmed+approved guests into the `attendees` table so they
 * show up in the main dashboard.
 *
 * Does NOT assign coupons or send emails — that's `dispatchLumaCoupons`.
 */
export async function syncLumaGuests(apiKey: string, eventApiId: string) {
  const fetched = await listAllGuests(apiKey, eventApiId)
  const now = new Date().toISOString()

  let upserted = 0
  let mirrored = 0

  for (const g of fetched) {
    await upsertGuest(g, eventApiId, now)
    upserted++

    // Mirror confirmed guests into attendees so the main dashboard stats
    // include them. Skip waitlist/declined/cancelled.
    if (g.registration_status === 'confirmed') {
      const email = g.email.toLowerCase()
      const existing = await db
        .select({ id: attendees.id })
        .from(attendees)
        .where(eq(attendees.email, email))
        .limit(1)
      if (!existing[0]) {
        await db.insert(attendees).values({
          name: g.name,
          email,
          source: 'luma',
          lumaGuestId: g.api_id,
          lumaEventId: eventApiId,
          registeredAt: g.created_at ?? now,
        })
        mirrored++
      }
    }
  }

  await db
    .update(lumaEvents)
    .set({ lastSyncedAt: now, isSyncEnabled: true, updatedAt: now })
    .where(eq(lumaEvents.apiId, eventApiId))

  return { upserted, mirrored }
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
 * For every confirmed guest without a coupon yet, assign one atomically and
 * (if Resend is configured) send the credit email. Returns counts for the UI.
 */
export async function dispatchLumaCoupons(eventApiId: string) {
  const [settings] = await db.select().from(appSettings).limit(1)
  const now = new Date().toISOString()

  const pending = await db
    .select()
    .from(lumaGuests)
    .where(
      sql`${lumaGuests.eventApiId} = ${eventApiId}
          AND ${lumaGuests.registrationStatus} = 'confirmed'
          AND ${lumaGuests.couponCodeId} IS NULL`,
    )

  let assigned = 0
  let emailed = 0

  for (const guest of pending) {
    const [coupon] = await db
      .update(couponCodes)
      .set({
        isUsed: true,
        usedAt: now,
        usedByType: 'luma_guest',
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

    if (!coupon) break // out of codes

    await db
      .update(lumaGuests)
      .set({ couponCodeId: coupon.id, updatedAt: now })
      .where(eq(lumaGuests.id, guest.id))

    // Keep the mirrored attendee in sync too.
    await db
      .update(attendees)
      .set({ couponCodeId: coupon.id, updatedAt: now })
      .where(eq(attendees.email, guest.email))

    assigned++

    if (canSendEmail(settings)) {
      try {
        await sendCouponEmail({
          settings,
          attendee: { name: guest.name, email: guest.email },
          couponCode: coupon,
          fromName: `Cafe Cursor ${settings.cityName}`,
        })
        await db
          .update(lumaGuests)
          .set({ emailSentAt: now, updatedAt: now })
          .where(eq(lumaGuests.id, guest.id))
        emailed++
      } catch (e) {
        console.error('resend failed for guest', guest.email, e)
      }
    }
  }

  return { assigned, emailed, pending: pending.length }
}
