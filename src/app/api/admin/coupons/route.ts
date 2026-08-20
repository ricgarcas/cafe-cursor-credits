import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const rows = await db
    .select({
      coupon: couponCodes,
      holderName: attendees.name,
      holderEmail: attendees.email,
    })
    .from(couponCodes)
    .leftJoin(eventAttendees, eq(eventAttendees.couponCodeId, couponCodes.id))
    .leftJoin(attendees, eq(attendees.id, eventAttendees.attendeeId))
    .orderBy(desc(couponCodes.createdAt))
  // One row per coupon — keep the first holder if several events share a code.
  const seen = new Map<number, (typeof rows)[number]>()
  for (const r of rows) if (!seen.has(r.coupon.id)) seen.set(r.coupon.id, r)
  return NextResponse.json({
    coupons: Array.from(seen.values()).map((r) => ({
      ...r.coupon,
      assigned_to: r.holderName ? { name: r.holderName, email: r.holderEmail } : null,
    })),
  })
}

const singleSchema = z.object({ code: z.string().min(1).max(512) })
const bulkSchema = z.object({ codes: z.array(z.string().min(1).max(512)).min(1).max(5000) })

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const body = await request.json().catch(() => null)

  // Detect shape.
  if (body && Array.isArray(body.codes)) {
    const parsed = bulkSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid codes array' }, { status: 400 })
    }
    const clean = Array.from(
      new Set(parsed.data.codes.map((c) => c.trim()).filter((c) => c.length > 0)),
    )
    if (clean.length === 0) {
      return NextResponse.json({ inserted: 0, duplicates: 0, total: 0 })
    }

    const existing = await db
      .select({ code: couponCodes.code })
      .from(couponCodes)
      .where(inArray(couponCodes.code, clean))
    const dupSet = new Set(existing.map((r) => r.code))

    const toInsert = clean
      .filter((code) => !dupSet.has(code))
      .map((code) => ({ code }))

    let inserted = 0
    if (toInsert.length > 0) {
      const rows = await db
        .insert(couponCodes)
        .values(toInsert)
        .returning({ id: couponCodes.id })
      inserted = rows.length
    }
    return NextResponse.json({
      inserted,
      duplicates: clean.length - inserted,
      total: clean.length,
    })
  }

  const parsed = singleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }
  try {
    const [row] = await db
      .insert(couponCodes)
      .values({ code: parsed.data.code.trim() })
      .returning()
    return NextResponse.json(row)
  } catch {
    return NextResponse.json({ error: 'Code already exists' }, { status: 400 })
  }
}
