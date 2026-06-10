import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resetPasswordWithToken } from '@/lib/auth/users'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  if (!rateLimit(`reset:${clientIp(request)}`)) return tooManyRequests()
  const parsed = z
    .object({ token: z.string().min(32), password: z.string().min(8).max(255) })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const ok = await resetPasswordWithToken(parsed.data.token, parsed.data.password)
  if (!ok) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
