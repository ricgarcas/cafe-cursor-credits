import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { createUser, countUsers, findUserByEmail } from '@/lib/auth/users'
import { getSession } from '@/lib/auth/session'

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const { name, email, password } = parsed.data

    await ensureDefaultSettings()

    // Bootstrap-only: this endpoint creates the first admin. Once any user
    // exists, new admin accounts must be provisioned by a signed-in admin
    // via a different flow (future work).
    if ((await countUsers()) > 0) {
      return NextResponse.json(
        { error: 'An admin already exists. Please sign in.' },
        { status: 403 },
      )
    }

    if (await findUserByEmail(email)) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 },
      )
    }

    const user = await createUser({ name, email, password })

    // Auto-login.
    const session = await getSession()
    session.userId = user.id
    session.email = user.email
    session.name = user.name
    await session.save()

    return NextResponse.json({ success: true, redirect: '/onboarding' })
  } catch (e) {
    console.error('admin-register error', e)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

void db
