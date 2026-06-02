import { desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { attendees, couponCodes, appSettings } from '@/lib/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { DashboardAttendeesTable } from '@/components/admin/dashboard-attendees-table'
import { Users, Ticket, Gift, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getStats() {
  const countRows = async (where?: import('drizzle-orm').SQL) => {
    const q = db.select({ c: sql<number>`count(*)` }).from(attendees)
    const [row] = await (where ? q.where(where) : q)
    return Number(row?.c ?? 0)
  }
  const countCoupons = async (where?: import('drizzle-orm').SQL) => {
    const q = db.select({ c: sql<number>`count(*)` }).from(couponCodes)
    const [row] = await (where ? q.where(where) : q)
    return Number(row?.c ?? 0)
  }
  const [totalRegistrations, couponsDistributed, couponsRemaining, couponsTotal] =
    await Promise.all([
      countRows(),
      countRows(isNotNull(attendees.couponCodeId)),
      countCoupons(eq(couponCodes.isUsed, false)),
      countCoupons(),
    ])
  void isNull
  return { totalRegistrations, couponsDistributed, couponsRemaining, couponsTotal }
}

async function getRecentAttendees() {
  const rows = await db
    .select()
    .from(attendees)
    .leftJoin(couponCodes, eq(attendees.couponCodeId, couponCodes.id))
    .orderBy(desc(attendees.registeredAt))
    .limit(10)
  return rows.map((r) => ({
    ...r.attendees,
    couponCode: r.coupon_codes,
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
  const [stats, recentAttendees, city] = await Promise.all([
    getStats(),
    getRecentAttendees(),
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
          Cafe Cursor <span className="font-tagline">{city}</span> — live view.
        </p>
      </div>

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

      <DashboardAttendeesTable initialAttendees={recentAttendees} />
    </div>
  )
}
