import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, isNotNull, isNull, like, or, SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendees, couponCodes } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function GET(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() || ''
  const status = searchParams.get('status') || 'all'
  const limit = Math.min(1000, Number(searchParams.get('limit')) || 500)

  const conditions: SQL[] = []
  if (search) {
    const like1 = `%${search}%`
    conditions.push(or(like(attendees.name, like1), like(attendees.email, like1))!)
  }
  if (status === 'with_coupon') conditions.push(isNotNull(attendees.couponCodeId))
  if (status === 'without_coupon') conditions.push(isNull(attendees.couponCodeId))

  const rows = await db
    .select()
    .from(attendees)
    .leftJoin(couponCodes, eq(attendees.couponCodeId, couponCodes.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(attendees.registeredAt))
    .limit(limit)

  return NextResponse.json({
    attendees: rows.map((r) => ({ ...r.attendees, couponCode: r.coupon_codes })),
  })
}
