import { desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appSettings, lumaEvents, lumaGuests, eventAttendees, events } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { LumaClient } from '@/components/admin/luma-client'

export const dynamic = 'force-dynamic'

export default async function LumaPage() {
  const [settings] = await db.select().from(appSettings).limit(1)
  const lumaEventRows = await db.select().from(lumaEvents).orderBy(desc(lumaEvents.startAt))
  const selectedEvent = await getSelectedEvent()

  // Confirmed counts come from the synced guest cache; claimed/emailed now live
  // on participations, linked back to a Luma event via events.lumaEventApiId.
  const confirmed = await db
    .select({
      eventApiId: lumaGuests.eventApiId,
      confirmed: sql<number>`sum(case when ${lumaGuests.registrationStatus} = 'confirmed' then 1 else 0 end)`,
    })
    .from(lumaGuests)
    .groupBy(lumaGuests.eventApiId)
  const credits = await db
    .select({
      eventApiId: events.lumaEventApiId,
      claimed: sql<number>`sum(case when ${eventAttendees.couponCodeId} is not null then 1 else 0 end)`,
      emailed: sql<number>`sum(case when ${eventAttendees.emailStatus} = 'sent' then 1 else 0 end)`,
    })
    .from(eventAttendees)
    .innerJoin(events, eq(eventAttendees.eventId, events.id))
    .where(isNotNull(events.lumaEventApiId))
    .groupBy(events.lumaEventApiId)

  const confirmedMap = new Map(confirmed.map((c) => [c.eventApiId, c.confirmed]))
  const creditMap = new Map(credits.map((c) => [c.eventApiId, c]))

  const hasKey = Boolean(settings?.lumaApiKey)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Luma</h1>
        <p className="text-muted-foreground mt-1">
          Pull your Luma event guest list and hand out Cursor credits
          automatically.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Syncing into: <span className="font-medium text-foreground">{selectedEvent.name}</span>
        </p>
      </div>

      <LumaClient
        hasApiKey={hasKey}
        initialEvents={lumaEventRows.map((e) => ({
          ...e,
          stats: {
            confirmed: confirmedMap.get(e.apiId) ?? 0,
            claimed: creditMap.get(e.apiId)?.claimed ?? 0,
            emailed: creditMap.get(e.apiId)?.emailed ?? 0,
          },
        }))}
      />
    </div>
  )
}
