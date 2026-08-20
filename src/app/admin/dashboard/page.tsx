import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { attendees, couponCodes, eventAttendees, appSettings } from '@/lib/db/schema'
import { getSelectedEvent } from '@/lib/db/events'
import { Card, CardContent } from '@/components/ui/card'
import { DashboardAttendeesTable } from '@/components/admin/dashboard-attendees-table'
import { GettingStarted } from '@/components/admin/getting-started'
import { AutoRefresh } from '@/components/admin/auto-refresh'
import { EditEventDialog } from '@/components/admin/edit-event-dialog'
import { currentUser } from '@/lib/auth/users'
import { eventDayLabel, formatEventDate } from '@/lib/event-date'
import { canSendEmail } from '@/lib/emails/send-coupon-email'
import { Users, Ticket, Gift, TrendingUp, UserCheck } from 'lucide-react'

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
  const checkedIn = await one(
    db.select({ c: sql<number>`count(*)` }).from(eventAttendees)
      .where(sql`${eventAttendees.eventId} = ${eventId} AND ${eventAttendees.checkedInAt} IS NOT NULL`),
  )
  return { totalRegistrations, couponsDistributed, couponsRemaining, couponsTotal, failedEmails, checkedIn }
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

async function getSettings() {
  await ensureDefaultSettings()
  const [row] = await db.select().from(appSettings).limit(1)
  return row
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
  const [stats, recentAttendees, settings, user] = await Promise.all([
    getStats(event.id),
    getRecentAttendees(event.id),
    getSettings(),
    currentUser(),
  ])
  const city = settings?.cityName ?? 'your city'
  // "Cafe Cursor CDMX — Cafe Cursor" reads broken; only show non-generic names.
  const genericEventName =
    event.name === 'Cafe Cursor' || event.name === `Cafe Cursor ${city}`

  // Pool utilization (global): event-scoped distributed over the global pool
  // total would mix scopes, so measure the whole pool consistently.
  const distributionRate =
    stats.couponsTotal > 0
      ? Math.round(((stats.couponsTotal - stats.couponsRemaining) / stats.couponsTotal) * 100)
      : 0

  const lowInventory =
    stats.couponsTotal > 0 &&
    stats.couponsRemaining <= Math.max(10, Math.ceil(stats.couponsTotal * 0.15))

  const checklist = {
    dismissed: settings?.checklistDismissed ?? false,
    eventReady: Boolean(event.eventDate || event.claimPasscode || !event.name.startsWith('Cafe Cursor')),
    hasCodes: stats.couponsTotal > 0,
    emailReady: canSendEmail(settings),
    lumaConnected: Boolean(settings?.lumaApiKey),
  }
  const checklistDone = checklist.eventReady && checklist.hasCodes && checklist.emailReady

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />
      <div>
        <h1 className="font-display text-3xl tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            Cafe Cursor <span className="font-tagline">{city}</span>
            {genericEventName ? null : <> — {event.name}</>}
          </span>
          {formatEventDate(event.eventDate) ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>·</span>
              {formatEventDate(event.eventDate)}
              {eventDayLabel(event.eventDate) ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wider">
                  {eventDayLabel(event.eventDate)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
              · no date set
            </span>
          )}
          {user?.role === 'admin' ? (
            <EditEventDialog
              event={{
                id: event.id,
                name: event.name,
                eventDate: event.eventDate,
                claimPasscode: event.claimPasscode,
              }}
            />
          ) : null}
        </p>
      </div>

      {!checklist.dismissed && !checklistDone ? (
        <GettingStarted
          checks={{
            eventReady: checklist.eventReady,
            hasCodes: checklist.hasCodes,
            emailReady: checklist.emailReady,
            lumaConnected: checklist.lumaConnected,
          }}
        />
      ) : null}

      {event.claimPasscode ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-border px-4 py-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Claim passcode</span>
          <span className="font-code text-2xl tracking-widest">{event.claimPasscode}</span>
        </div>
      ) : null}

      {lowInventory ? (
        <div className="flex items-center justify-between rounded-[10px] border border-border px-4 py-3">
          <p className="text-sm">
            <span className="font-code">{stats.couponsRemaining}</span>{' '}
            code{stats.couponsRemaining === 1 ? '' : 's'} remaining in the shared pool.
          </p>
          <Link href="/admin/coupons" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Add codes
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Registrations" value={stats.totalRegistrations} icon={Users} />
        <Kpi label="Checked in" value={stats.checkedIn} icon={UserCheck} tone="green" />
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
        <div className="flex items-center justify-between rounded-[10px] border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="text-sm">
            <span className="font-medium text-destructive">
              {stats.failedEmails} email{stats.failedEmails === 1 ? '' : 's'} failed to send.
            </span>{' '}
            Those attendees have a code but never got it.
          </p>
          <Link href="/admin/attendees" className="text-sm underline underline-offset-4 hover:text-foreground">
            Review &amp; resend
          </Link>
        </div>
      ) : null}

      <DashboardAttendeesTable initialAttendees={recentAttendees} />
    </div>
  )
}
