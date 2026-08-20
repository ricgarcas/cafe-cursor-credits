import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings, couponCodes } from '@/lib/db/schema'
import { getActiveEvent } from '@/lib/db/events'
import { canSendEmail } from '@/lib/emails/send-coupon-email'
import { eventDayLabel, formatEventDate } from '@/lib/event-date'

export type ReadinessItem = {
  key: string
  status: 'pass' | 'warn' | 'fail'
  label: string
  detail: string
  action?: string
}

/** Same gates as the dashboard checklist, shaped for an agent to read aloud. */
export async function getReadiness(): Promise<{ ready: boolean; items: ReadinessItem[] }> {
  await ensureDefaultSettings()
  // MCP requests carry no session cookie, so bind to the live event rather
  // than the "event this admin is viewing".
  const event = await getActiveEvent()
  const [[settings], [total], [available]] = await Promise.all([
    db.select().from(appSettings).limit(1),
    db.select({ c: sql<number>`count(*)` }).from(couponCodes),
    db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false)),
  ])

  const totalCodes = Number(total?.c ?? 0)
  const availableCodes = Number(available?.c ?? 0)
  const dateLabel = formatEventDate(event.eventDate)
  const dayLabel = eventDayLabel(event.eventDate)

  const items: ReadinessItem[] = [
    {
      key: 'event',
      status: event.eventDate ? 'pass' : 'warn',
      label: 'Event',
      detail: event.eventDate
        ? `${event.name} — ${dateLabel}${dayLabel ? ` (${dayLabel.toLowerCase()})` : ''}`
        : `${event.name} — no date set`,
      action: event.eventDate ? undefined : 'Set a date with create_event or in Settings → General',
    },
    {
      key: 'codes',
      status: totalCodes === 0 ? 'fail' : availableCodes === 0 ? 'warn' : 'pass',
      label: 'Codes',
      detail:
        totalCodes === 0
          ? 'no codes imported'
          : `${totalCodes} total, ${availableCodes} available`,
      action: availableCodes === 0 ? 'Import more codes with add_codes' : undefined,
    },
    {
      key: 'email',
      status: canSendEmail(settings) ? 'pass' : 'fail',
      label: 'Email',
      detail: canSendEmail(settings)
        ? `${settings.emailProvider}, sender ${settings.fromEmail ?? 'default'}`
        : 'not configured — codes cannot be emailed',
      action: canSendEmail(settings) ? undefined : 'Run configure_email',
    },
    {
      key: 'luma',
      status: settings?.lumaApiKey ? 'pass' : 'fail',
      label: 'Luma',
      detail: settings?.lumaApiKey ? 'connected' : 'not connected (optional)',
      action: settings?.lumaApiKey ? undefined : 'Add a Luma API key in Settings → Luma',
    },
    {
      key: 'claim',
      status: settings?.claimEnabled ? 'pass' : 'warn',
      label: 'Claim portal',
      detail: settings?.claimEnabled ? 'open' : 'closed — attendees cannot claim',
      action: settings?.claimEnabled ? undefined : 'Open it with set_claim_portal',
    },
  ]

  // Luma is optional; readiness turns on the gates that block handing out codes.
  const ready = ['event', 'codes', 'email'].every(
    (k) => items.find((i) => i.key === k)!.status === 'pass',
  )
  return { ready, items }
}
