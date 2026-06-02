import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { attendees, couponCodes, appSettings } from '@/lib/db/schema'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  sendEmail: z.boolean().optional().default(false),
})

/**
 * Self-service on-site claim. Registers the attendee and returns the code
 * directly in the response so the attendee can redeem it immediately from
 * their phone. Idempotent by email.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDefaultSettings()
    const body = await request.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const { name, email, sendEmail } = parsed.data
    const normalizedEmail = email.toLowerCase()

    const [settings] = await db.select().from(appSettings).limit(1)

    // Existing attendee?
    const [existing] = await db
      .select()
      .from(attendees)
      .where(eq(attendees.email, normalizedEmail))
      .limit(1)

    if (existing?.couponCodeId) {
      const [existingCode] = await db
        .select()
        .from(couponCodes)
        .where(eq(couponCodes.id, existing.couponCodeId))
        .limit(1)
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        code: existingCode?.code ?? null,
        attendee: { name: existing.name, email: existing.email },
      })
    }

    // Attendee row (insert or reuse).
    let attendeeId = existing?.id
    if (!attendeeId) {
      const [row] = await db
        .insert(attendees)
        .values({
          name,
          email: normalizedEmail,
          source: 'website',
        })
        .returning()
      attendeeId = row.id
    }

    // Atomically reserve an unused coupon.
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
      return NextResponse.json({ success: true, code: null, outOfCodes: true })
    }

    await db
      .update(attendees)
      .set({ couponCodeId: coupon.id, updatedAt: now })
      .where(eq(attendees.id, attendeeId))

    if (sendEmail && canSendEmail(settings)) {
      try {
        await sendCouponEmail({
          settings: settings!,
          attendee: {
            id: attendeeId,
            name,
            email: normalizedEmail,
            couponCodeId: coupon.id,
            source: 'website',
            lumaGuestId: null,
            lumaEventId: null,
            registeredAt: now,
            createdAt: now,
            updatedAt: now,
          },
          couponCode: coupon,
          fromName: `Cafe Cursor ${settings!.cityName}`,
        })
      } catch (e) {
        console.error('email send failed', e)
      }
    }

    return NextResponse.json({
      success: true,
      code: coupon.code,
      attendee: { name, email: normalizedEmail },
    })
  } catch (e) {
    console.error('claim error', e)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
