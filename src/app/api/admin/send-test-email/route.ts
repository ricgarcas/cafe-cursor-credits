import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { canSendEmail, sendAppEmail } from '@/lib/emails/send-coupon-email'
import { requireUser } from '@/lib/auth/guard'

/** Sends a test message to the signed-in admin using the SAVED settings. */
export async function POST() {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response

  const [settings] = await db.select().from(appSettings).limit(1)
  if (!canSendEmail(settings)) {
    return NextResponse.json(
      { error: 'Email is not fully configured yet. Save your settings first.' },
      { status: 400 },
    )
  }
  try {
    await sendAppEmail({
      settings,
      to: gate.user.email,
      subject: 'Cafe Cursor test email',
      html: '<p>Your email settings work. Attendees will get their credit codes from this sender.</p>',
      fromName: `Cafe Cursor ${settings.cityName}`,
    })
    return NextResponse.json({ success: true, to: gate.user.email })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Send failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
