import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const { id } = await params
  const userId = Number(id)
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  if (userId === gate.user.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 })
  }
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.role === 'admin') {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(users).where(eq(users.role, 'admin'))
    if (Number(row.c) <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last admin' }, { status: 400 })
    }
  }
  await db.delete(users).where(eq(users.id, userId))
  return NextResponse.json({ success: true })
}
