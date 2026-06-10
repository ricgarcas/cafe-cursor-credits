import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { findUserByEmail, verifyPassword } from '@/lib/auth/users'
import { getSession } from '@/lib/auth/session'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  if (!rateLimit(`login:${clientIp(request)}`)) return tooManyRequests()
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
  }

  const { email, password } = parsed.data
  const user = await findUserByEmail(email)
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const session = await getSession()
  session.userId = user.id
  session.email = user.email
  session.name = user.name
  await session.save()

  return NextResponse.json({ success: true, must_change_password: user.mustChangePassword })
}
