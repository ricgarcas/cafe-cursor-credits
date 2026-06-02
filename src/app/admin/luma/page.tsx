import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, lumaEvents, lumaGuests } from '@/lib/db/schema'
import { LumaClient } from '@/components/admin/luma-client'

export const dynamic = 'force-dynamic'

export default async function LumaPage() {
  const [settings] = await db.select().from(appSettings).limit(1)
  const events = await db.select().from(lumaEvents).orderBy(desc(lumaEvents.startAt))

  // Per-event guest counters (confirmed / claimed / emailed).
  const counters = await db
    .select({
      eventApiId: lumaGuests.eventApiId,
      confirmed: sql<number>`sum(case when ${lumaGuests.registrationStatus} = 'confirmed' then 1 else 0 end)`,
      claimed: sql<number>`sum(case when ${lumaGuests.couponCodeId} is not null then 1 else 0 end)`,
      emailed: sql<number>`sum(case when ${lumaGuests.emailSentAt} is not null then 1 else 0 end)`,
    })
    .from(lumaGuests)
    .groupBy(lumaGuests.eventApiId)
  const counterMap = new Map(counters.map((c) => [c.eventApiId, c]))
  void asc
  void eq

  const hasKey = Boolean(settings?.lumaApiKey)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Luma</h1>
        <p className="text-muted-foreground mt-1">
          Pull your Luma event guest list and hand out Cursor credits
          automatically.
        </p>
      </div>

      <LumaClient
        hasApiKey={hasKey}
        initialEvents={events.map((e) => ({
          ...e,
          stats: counterMap.get(e.apiId) ?? { confirmed: 0, claimed: 0, emailed: 0 },
        }))}
      />
    </div>
  )
}
