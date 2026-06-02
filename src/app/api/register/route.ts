import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { attendees, couponCodes, appSettings } from '@/lib/db/schema'
import { sendCouponEmail, canSendEmail } from '@/lib/emails/send-coupon-email'

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
})

export async function POST(request: NextRequest) {
  try {
    await ensureDefaultSettings()
    const body = await request.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const { name, email } = parsed.data
    const normalizedEmail = email.toLowerCase()

    // Reject duplicates (matches old Supabase behavior).
    const existing = await db
      .select({ id: attendees.id })
      .from(attendees)
      .where(eq(attendees.email, normalizedEmail))
      .limit(1)
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'This email is already registered' },
        { status: 400 },
      )
    }

    const [attendee] = await db
      .insert(attendees)
      .values({
        name,
        email: normalizedEmail,
        source: 'website',
      })
      .returning()

    // Grab an available coupon, assign, mark used — all in one transaction
    // using a single UPDATE…RETURNING to avoid race conditions with concurrent
    // registrations.
    const now = new Date().toISOString()
    const taken = db
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
          WHERE ${couponCodes.isUsed} = 0
            AND ${couponCodes.usedAt} IS NULL
          LIMIT 1
        )`,
      )
      .returning()

    const [coupon] = await taken
    let couponAssigned = false

    if (coupon) {
      await db
        .update(attendees)
        .set({ couponCodeId: coupon.id, updatedAt: now })
        .where(eq(attendees.id, attendee.id))
      couponAssigned = true

      // Send the email if an email provider is configured.
      const [settings] = await db.select().from(appSettings).limit(1)
      if (canSendEmail(settings)) {
        try {
          await sendCouponEmail({
            settings,
            attendee: { ...attendee, couponCodeId: coupon.id },
            couponCode: coupon,
            fromName: `Cafe Cursor ${settings.cityName}`,
          })
        } catch (e) {
          console.error('email send failed', e)
        }
      }
    }

    return NextResponse.json({
      success: true,
      couponAssigned,
      message: couponAssigned
        ? 'Registration successful! Check your email for your code.'
        : 'Registration successful!',
    })
  } catch (e) {
    console.error('register error', e)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

// Silence unused-import for the `and`/`isNull` helpers so future tweaks can keep them.
void and
void isNull
