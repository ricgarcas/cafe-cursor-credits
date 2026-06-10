import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees, appSettings } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { Card, CardContent } from '@/components/ui/card'
import { DashboardAttendeesTable } from '@/components/admin/dashboard-attendees-table'
import { Users, Ticket, Gift, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getStats(eventId: number) {
  const one = async (q: Promise<{ c: number }[]>) => Number((await q)[0]?.c ?? 0)
  const [totalRegistrations, couponsDistributed, couponsRemaining, couponsTotal, failedEmails] = await Promise.all([
    one(db.select({ c: sql<number>`count(*)` }).from(eventAttendees).where(eq(eventAttendees.eventId, eventId))),
    one(
      db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
        .where(sql`${eventAttendees.eventId} = ${eventId} AND ${eventAttendees.couponCodeId} IS NOT NULL`),
    ),
    one(db.select({ c: sql<number>`count(*)` }).from(couponCodes).where(eq(couponCodes.isUsed, false))),
    one(db.select({ c: sql<number>`count(*)` }).from(couponCodes)),
    one(
      db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
        .where(sql`${eventAttendees.eventId} = ${eventId} AND ${eventAttendees.emailStatus} = 'failed'`),
    ),
  ])
  return { totalRegistrations, couponsDistributed, couponsRemaining, couponsTotal, failedEmails }
}

async function getRecentAttendees(eventId: number) {
  const rows = await db
    .select()
    .from(eventAttendees)
    .innerJoin(attendees, eq(eventAttendees.attendeeId, attendees.id))
    .leftJoin(couponCodes, eq(eventAttendees.couponCodeId, couponCodes.id))
    .where(eq(eventAttendees.eventId, eventId))
    .orderBy(desc(eventAttendees.registeredAt))
    .limit(10)
  return rows.map((r) => ({
    id: r.event_attendees.id,
    name: r.attendees.name,
    email: r.attendees.email,
    registered_at: r.event_attendees.registeredAt,
    coupon_code: r.coupon_codes?.code ?? null,
  }))
}

async function getCity() {
  await ensureDefaultSettings()
  const [row] = await db.select().from(appSettings).limit(1)
  return row?.cityName ?? 'your city'
}

function Kpi({
  label,
  value,
  suffix,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: number | string
  suffix?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'green' | 'orange'
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-dotted opacity-60 pointer-events-none" aria-hidden />
      <CardContent className="relative flex flex-col gap-3 py-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <span
            className={
              tone === 'green'
                ? 'text-[color:var(--brand-green)]'
                : tone === 'orange'
                  ? 'text-[color:var(--brand-orange)]'
                  : 'text-muted-foreground'
            }
          >
            <Icon className="size-4" />
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl tracking-tight">{value}</span>
          {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  const event = await getSelectedEvent()
  const [stats, recentAttendees, city] = await Promise.all([
    getStats(event.id),
    getRecentAttendees(event.id),
    getCity(),
  ])

  const distributionRate =
    stats.couponsTotal > 0
      ? Math.round((stats.couponsDistributed / stats.couponsTotal) * 100)
      : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Cafe Cursor <span className="font-tagline">{city}</span> — {event.name}
        </p>
      </div>

      {event.claimPasscode ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-border px-4 py-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Claim passcode</span>
          <span className="font-code text-2xl tracking-widest">{event.claimPasscode}</span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Registrations" value={stats.totalRegistrations} icon={Users} />
        <Kpi
          label="Credits claimed"
          value={stats.couponsDistributed}
          icon={Gift}
          tone="green"
        />
        <Kpi
          label="Credits remaining"
          value={stats.couponsRemaining}
          icon={Ticket}
          tone="orange"
        />
        <Kpi
          label="Distribution rate"
          value={`${distributionRate}`}
          suffix="%"
          icon={TrendingUp}
        />
      </div>

      {stats.failedEmails > 0 ? (
        <p className="text-sm text-muted-foreground">
          {stats.failedEmails} email{stats.failedEmails === 1 ? '' : 's'} failed to send —{' '}
          <Link href="/admin/attendees" className="underline underline-offset-4">review in Attendees</Link>.
        </p>
      ) : null}

      <DashboardAttendeesTable initialAttendees={recentAttendees} />
    </div>
  )
}
