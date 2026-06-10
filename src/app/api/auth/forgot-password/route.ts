import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { issueResetToken } from '@/lib/auth/users'
import { canSendEmail, sendAppEmail } from '@/lib/emails/send-coupon-email'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  if (!rateLimit(`forgot:${clientIp(request)}`)) return tooManyRequests()
  const parsed = z.object({ email: z.string().email() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const [settings] = await db.select().from(appSettings).limit(1)
  const generic = {
    success: true,
    message: 'If that account exists, a reset link is on its way.',
    email_configured: canSendEmail(settings),
  }
  if (!canSendEmail(settings)) return NextResponse.json(generic)

  const token = await issueResetToken(parsed.data.email)
  if (token) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
    try {
      await sendAppEmail({
        settings,
        to: parsed.data.email.toLowerCase(),
        subject: 'Reset your Cafe Cursor password',
        html: `<p>Someone asked to reset this account's password. The link works once and expires in an hour.</p>
               <p><a href="${base}/reset-password?token=${token}">Set a new password</a></p>
               <p>Didn't ask? Ignore this email.</p>`,
        fromName: `Cafe Cursor ${settings.cityName}`,
      })
    } catch (e) {
      console.error('reset email failed', e)
    }
  }
  return NextResponse.json(generic)
}
