import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardDescription, CardTitle } from '@/components/ui/card'
import { Users, Ticket, Gift } from 'lucide-react'
import { DashboardAttendeesTable } from '@/components/admin/dashboard-attendees-table'

export const dynamic = 'force-dynamic'

async function getStats() {
  const supabase = await createClient()

  const [
    { count: totalRegistrations },
    { count: couponsDistributed },
    { count: couponsRemaining },
  ] = await Promise.all([
    supabase.from('attendees').select('*', { count: 'exact', head: true }),
    supabase.from('attendees').select('*', { count: 'exact', head: true }).not('coupon_code_id', 'is', null),
    supabase.from('coupon_codes').select('*', { count: 'exact', head: true }).eq('is_used', false),
  ])

  return {
    totalRegistrations: totalRegistrations || 0,
    couponsDistributed: couponsDistributed || 0,
    couponsRemaining: couponsRemaining || 0,
  }
}

async function getRecentAttendees() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('attendees')
    .select(`
      *,
      coupon_codes (*)
    `)
    .order('registered_at', { ascending: false })
    .limit(10)

  return data || []
}

export default async function DashboardPage() {
  const stats = await getStats()
  const recentAttendees = await getRecentAttendees()

  return (
    <div className="space-y-6 mt-3">
      <div>
        <h1 className="text-2xl font-medium font-sans">Dashboard</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardDescription className="text-lg font-light">Total Registrations</CardDescription>
              <CardTitle className="text-2xl font-medium">{stats.totalRegistrations}</CardTitle>
            </div>
            <Users className="size-8 text-muted-foreground" />
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardDescription className="text-lg font-light">Coupons Distributed</CardDescription>
              <CardTitle className="text-2xl font-medium">{stats.couponsDistributed}</CardTitle>
            </div>
            <Ticket className="size-8 text-muted-foreground" />
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="">
              <CardDescription className="text-lg font-light">Coupons Remaining</CardDescription>
              <CardTitle className="text-2xl font-medium">{stats.couponsRemaining}</CardTitle>
            </div>
            <Gift className="size-8 text-muted-foreground" />
          </CardHeader>
        </Card>
      </div>

      {/* Attendees Table */}
      <DashboardAttendeesTable initialAttendees={recentAttendees} />
    </div>
  )
}

