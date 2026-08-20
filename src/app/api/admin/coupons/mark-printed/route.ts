import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { couponCodes } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) })

/**
 * Printed cards leave the building — burn those codes so /claim and /register
 * can never hand the same code out digitally.
 */
export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid ids' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const rows = await db
    .update(couponCodes)
    .set({ isUsed: true, usedAt: now, updatedAt: now })
    .where(and(inArray(couponCodes.id, parsed.data.ids), eq(couponCodes.isUsed, false)))
    .returning({ id: couponCodes.id })
  return NextResponse.json({ marked: rows.length })
}
