import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'
import { hashPassword, findUserByEmail } from '@/lib/auth/users'
import { getSession } from '@/lib/auth/session'

const schema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
  // Empty string means "leave password alone"; otherwise require 6+.
  password: z.union([z.literal(''), z.string().min(6)]).optional(),
})

/**
 * Update the currently signed-in admin's name / email / password. Used by the
 * onboarding wizard's "Your account" step and by Settings later.
 */
export async function PUT(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { user } = gate

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })
  }

  const update: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.email !== undefined && parsed.data.email !== user.email) {
    const existing = await findUserByEmail(parsed.data.email)
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'That email is already in use.' }, { status: 400 })
    }
    update.email = parsed.data.email
  }
  if (parsed.data.password) {
    update.passwordHash = await hashPassword(parsed.data.password)
  }

  const [row] = await db
    .update(users)
    .set(update)
    .where(eq(users.id, user.id))
    .returning()

  // Keep the session in sync with any name/email change.
  const session = await getSession()
  session.name = row.name
  session.email = row.email
  await session.save()

  return NextResponse.json({
    id: row.id,
    name: row.name,
    email: row.email,
  })
}

export async function GET() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const { user } = gate
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    must_change_password: user.mustChangePassword,
  })
}
