import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { createUser, findUserByEmail } from '@/lib/auth/users'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt))
  return NextResponse.json({
    users: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.createdAt })),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  role: z.enum(['admin', 'host']),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  if (await findUserByEmail(parsed.data.email)) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
  }
  // Shown once in the UI, never stored in plaintext, changed on first login.
  const tempPassword = randomBytes(9).toString('base64url')
  const user = await createUser({ ...parsed.data, password: tempPassword, mustChangePassword: true })
  return NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    temp_password: tempPassword,
  })
}
