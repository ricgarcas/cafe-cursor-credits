import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { couponCodes } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const schema = z.object({ code: z.string().min(1).max(512) })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response

  const { id } = await params
  const couponId = Number(id)
  if (!Number.isFinite(couponId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }

  try {
    const [row] = await db
      .update(couponCodes)
      .set({ code: parsed.data.code.trim(), updatedAt: new Date().toISOString() })
      .where(eq(couponCodes.id, couponId))
      .returning()
    if (!row) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch {
    return NextResponse.json({ error: 'Code already exists' }, { status: 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response

  const { id } = await params
  const couponId = Number(id)
  if (!Number.isFinite(couponId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  await db.delete(couponCodes).where(eq(couponCodes.id, couponId))
  return NextResponse.json({ success: true })
}
