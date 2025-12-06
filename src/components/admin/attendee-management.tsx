'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AttendeeWithCoupon } from '@/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { Search, MoreHorizontal, Mail, Ticket, Trash2, Download, Users } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type FilterStatus = 'all' | 'with_coupon' | 'without_coupon'

export function AttendeeManagement() {
  const [attendees, setAttendees] = useState<AttendeeWithCoupon[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    withCoupons: 0,
    withoutCoupons: 0,
  })

  const supabase = createClient()

  const fetchAttendees = useCallback(async () => {
    setLoading(true)
    
    let query = supabase
      .from('attendees')
      .select(`*, coupon_codes (*)`)
      .order('registered_at', { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    if (statusFilter === 'with_coupon') {
      query = query.not('coupon_code_id', 'is', null)
    } else if (statusFilter === 'without_coupon') {
      query = query.is('coupon_code_id', null)
    }

    const { data, error } = await query

    if (error) {
      toast.error('Failed to load attendees')
      console.error(error)
    } else {
      setAttendees(data || [])
    }

    setLoading(false)
  }, [supabase, search, statusFilter])

  const fetchStats = useCallback(async () => {
    const [
      { count: total },
      { count: withCoupons },
      { count: withoutCoupons },
    ] = await Promise.all([
      supabase.from('attendees').select('*', { count: 'exact', head: true }),
      supabase.from('attendees').select('*', { count: 'exact', head: true }).not('coupon_code_id', 'is', null),
      supabase.from('attendees').select('*', { count: 'exact', head: true }).is('coupon_code_id', null),
    ])

    setStats({
      total: total || 0,
      withCoupons: withCoupons || 0,
      withoutCoupons: withoutCoupons || 0,
    })
  }, [supabase])

  useEffect(() => {
    fetchAttendees()
    fetchStats()
  }, [fetchAttendees, fetchStats])

  const handleSendEmail = async (attendeeId: number) => {
    const attendee = attendees.find((a) => a.id === attendeeId)
    if (!attendee?.coupon_codes) {
      toast.error('This attendee does not have a coupon code assigned')
      return
    }

    try {
      const response = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId }),
      })

      if (!response.ok) {
        throw new Error('Failed to send email')
      }

      toast.success('Email sent successfully!')
    } catch {
      toast.error('Failed to send email')
    }
  }

  const handleAssignCoupon = async (attendeeId: number) => {
    try {
      const response = await fetch('/api/admin/assign-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign coupon')
      }

      toast.success('Coupon assigned and email sent!')
      fetchAttendees()
      fetchStats()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign coupon')
    }
  }

  const handleDeleteAttendee = async (attendeeId: number) => {
    if (!confirm('Are you sure you want to delete this attendee?')) return

    const { error } = await supabase
      .from('attendees')
      .delete()
      .eq('id', attendeeId)

    if (error) {
      toast.error('Failed to delete attendee')
    } else {
      toast.success('Attendee deleted')
      fetchAttendees()
      fetchStats()
    }
  }

  const handleExportCsv = () => {
    const headers = ['Name', 'Email', 'Registered At', 'Coupon Code']
    const rows = attendees.map((a) => [
      a.name,
      a.email,
      new Date(a.registered_at).toISOString(),
      a.coupon_codes?.code || '',
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendees-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="text-lg font-light">Total Attendees</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="text-lg font-light">With Coupons</CardDescription>
            <CardTitle className="text-2xl">{stats.withCoupons}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="text-lg font-light">Without Coupons</CardDescription>
            <CardTitle className="text-2xl">{stats.withoutCoupons}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Table with Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Attendees</SelectItem>
                <SelectItem value="with_coupon">With Coupon</SelectItem>
                <SelectItem value="without_coupon">Without Coupon</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleExportCsv}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : attendees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No attendees found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Coupon</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendees.map((attendee) => (
                  <TableRow key={attendee.id}>
                    <TableCell className="font-medium">{attendee.name}</TableCell>
                    <TableCell className="text-muted-foreground">{attendee.email}</TableCell>
                    <TableCell>
                      {attendee.coupon_codes ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          {attendee.coupon_codes.code}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          None
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(attendee.registered_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {attendee.coupon_codes ? (
                            <DropdownMenuItem
                              onClick={() => handleSendEmail(attendee.id)}
                              className="cursor-pointer"
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Resend Email
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleAssignCoupon(attendee.id)}
                              className="cursor-pointer"
                            >
                              <Ticket className="mr-2 h-4 w-4" />
                              Assign Coupon
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleDeleteAttendee(attendee.id)}
                            className="text-destructive focus:text-destructive cursor-pointer"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

