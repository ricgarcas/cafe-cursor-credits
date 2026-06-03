import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { lumaEvents, lumaGuests, attendees, couponCodes, appSettings } from '@/lib/db/schema'
import { listAllEvents, listAllGuests, type LumaGuest } from './client'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'

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
export async function syncLumaGuests(apiKey: string, eventApiId: string) {
  const { guests: fetched, truncated } = await listAllGuests(apiKey, eventApiId)
  const now = new Date().toISOString()

  let upserted = 0
  let mirrored = 0

  for (const g of fetched) {
    await upsertGuest(g, eventApiId, now)
    upserted++

    // Mirror confirmed, credit-eligible guests into attendees so the main
    // dashboard stats include them. Skip waitlist/declined/cancelled and
    // anyone still pending host approval on gated events.
    if (g.registration_status === 'confirmed' && isApprovedForCredit(g.approval_status)) {
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
 * For every confirmed guest, ensure exactly one coupon is assigned and the
 * credit email is sent. Idempotent and retry-safe:
 *   • A guest whose email already holds a coupon (website register, /claim, or
 *     a prior sync) reuses that code — the same person never gets two.
 *   • A guest with a coupon but no email yet is re-attempted, so a failed send
 *     isn't silently dropped.
 * Returns counts for the UI.
 */
export async function dispatchLumaCoupons(eventApiId: string) {
  const [settings] = await db.select().from(appSettings).limit(1)
  const now = new Date().toISOString()

  // Confirmed + credit-eligible (open events, or approved on gated events) that
  // need a coupon OR need their email sent — the emailSentAt clause makes a
  // previously failed send retryable instead of stranding the guest.
  const pending = await db
    .select()
    .from(lumaGuests)
    .where(
      sql`${lumaGuests.eventApiId} = ${eventApiId}
          AND ${lumaGuests.registrationStatus} = 'confirmed'
          AND (${lumaGuests.approvalStatus} IS NULL
               OR ${lumaGuests.approvalStatus} NOT IN ('pending_approval', 'declined'))
          AND (${lumaGuests.couponCodeId} IS NULL OR ${lumaGuests.emailSentAt} IS NULL)`,
    )

  let assigned = 0
  let emailed = 0

  for (const guest of pending) {
    let couponId = guest.couponCodeId

    if (couponId == null) {
      // Reserve + link as one unit so a mid-sequence failure can't burn a code
      // with no owner. Returns null when inventory is exhausted.
      couponId = await db.transaction(async (tx) => {
        // Reuse the coupon this email already holds before burning a fresh one.
        const [prior] = await tx
          .select({ couponCodeId: attendees.couponCodeId })
          .from(attendees)
          .where(eq(attendees.email, guest.email))
          .limit(1)

        let id = prior?.couponCodeId ?? null
        if (id == null) {
          const [coupon] = await tx
            .update(couponCodes)
            .set({ isUsed: true, usedAt: now, usedByType: 'luma_guest', updatedAt: now })
            .where(
              sql`${couponCodes.id} = (
                SELECT id FROM ${couponCodes}
                WHERE ${couponCodes.isUsed} = 0 AND ${couponCodes.usedAt} IS NULL
                LIMIT 1
              )`,
            )
            .returning()
          if (!coupon) return null // out of codes
          id = coupon.id
        }

        await tx
          .update(lumaGuests)
          .set({ couponCodeId: id, updatedAt: now })
          .where(eq(lumaGuests.id, guest.id))

        // Mirror onto the attendee, but only fill an empty slot — never clobber
        // a coupon they already hold (that would orphan the old code).
        await tx
          .update(attendees)
          .set({ couponCodeId: id, updatedAt: now })
          .where(sql`${attendees.email} = ${guest.email} AND ${attendees.couponCodeId} IS NULL`)

        return id
      })

      if (couponId == null) break // out of codes
      assigned++
    }

    if (guest.emailSentAt == null && canSendEmail(settings)) {
      const [coupon] = await db
        .select()
        .from(couponCodes)
        .where(eq(couponCodes.id, couponId))
        .limit(1)
      if (!coupon) continue
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
