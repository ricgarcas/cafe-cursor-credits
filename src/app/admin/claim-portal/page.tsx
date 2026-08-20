import { headers } from 'next/headers'
import { eq, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings, couponCodes, eventAttendees } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { ClaimPortalClient } from '@/components/admin/claim-portal-client'

export const dynamic = 'force-dynamic'

async function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export default async function ClaimPortalPage() {
  await ensureDefaultSettings()
  const event = await getSelectedEvent()
  const [[settings], [claimed], [remaining], baseUrl] = await Promise.all([
    db.select().from(appSettings).limit(1),
    db
      .select({ c: sql<number>`count(*)` })
      .from(eventAttendees)
      .where(sql`${eventAttendees.eventId} = ${event.id} AND ${eventAttendees.couponCodeId} IS NOT NULL`),
    db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false)),
    getBaseUrl(),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Claim portal</h1>
        <p className="mt-1 text-muted-foreground">
          Put this on the screen at your venue — attendees scan and get a code on the spot.
        </p>
      </div>
      <ClaimPortalClient
        claimUrl={`${baseUrl}/claim`}
        city={settings?.cityName ?? 'Cafe Cursor'}
        eventName={event.name}
        eventDate={event.eventDate}
        passcode={event.claimPasscode}
        enabled={settings?.claimEnabled ?? true}
        stats={{ claimed: Number(claimed?.c ?? 0), remaining: Number(remaining?.c ?? 0) }}
      />
    </div>
  )
}
