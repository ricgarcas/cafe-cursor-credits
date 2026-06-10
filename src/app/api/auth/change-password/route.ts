import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { hashPassword, verifyPassword } from '@/lib/auth/users'

const schema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(255),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  const { currentPassword, newPassword } = parsed.data
  // Temp-password users skip the current-password check; everyone else proves it.
  if (!gate.user.mustChangePassword) {
    if (!currentPassword || !(await verifyPassword(currentPassword, gate.user.passwordHash))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
  }
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, gate.user.id))
  return NextResponse.json({ success: true })
}
