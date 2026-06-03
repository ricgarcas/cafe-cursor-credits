'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { AttendeeWithCoupon } from '@/lib/db/schema'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { toast } from 'sonner'
import { Search, Send, Ticket, Trash2, Download } from 'lucide-react'
import { format } from 'date-fns'

type FilterStatus = 'all' | 'with_coupon' | 'without_coupon'

export function AttendeeManagement() {
  const [attendees, setAttendees] = useState<AttendeeWithCoupon[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 9

  const fetchAttendees = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    try {
      const res = await fetch(`/api/admin/attendees?${params.toString()}`)
      const json = await res.json()
      setAttendees(json.attendees ?? [])
      setCurrentPage(1)
    } catch {
      toast.error('Failed to load attendees')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    fetchAttendees()
  }, [fetchAttendees])

  const stats = useMemo(() => {
    const withCoupons = attendees.filter((a) => a.couponCode).length
    return {
      total: attendees.length,
      withCoupons,
      withoutCoupons: attendees.length - withCoupons,
    }
  }, [attendees])

  const totalPages = Math.max(1, Math.ceil(attendees.length / itemsPerPage))
  const pageSlice = attendees.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  )

  const sendEmail = async (id: number) => {
    try {
      const res = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      toast.success('Email sent')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send email')
    }
  }

  const assignCoupon = async (id: number) => {
    try {
      const res = await fetch('/api/admin/assign-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Code assigned')
      fetchAttendees()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this attendee?')) return
    const res = await fetch(`/api/admin/attendees/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Deleted')
      fetchAttendees()
    } else toast.error('Failed to delete')
  }

  const exportCsv = () => {
    const headers = ['Name', 'Email', 'Registered At', 'Code', 'Source']
    const rows = attendees.map((a) => [
      a.name,
      a.email,
      a.registeredAt,
      a.couponCode?.code ?? '',
      a.source,
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `attendees-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="With code" value={stats.withCoupons} tone="green" />
        <StatCard label="Without code" value={stats.withoutCoupons} tone="orange" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All attendees</SelectItem>
                <SelectItem value="with_coupon">With code</SelectItem>
                <SelectItem value="without_coupon">Without code</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Loading…</div>
          ) : attendees.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No attendees</div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSlice.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">{a.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {a.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.couponCode ? (
                        <span className="font-code text-xs">
                          {a.couponCode.code.slice(0, 24)}
                          {a.couponCode.code.length > 24 ? '…' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {a.registeredAt ? format(new Date(a.registeredAt), 'MMM d, HH:mm') : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      {!a.couponCode ? (
                        <Button variant="ghost" size="icon-sm" onClick={() => assignCoupon(a.id)} title="Assign code">
                          <Ticket className="size-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon-sm" onClick={() => sendEmail(a.id)} title="Resend email">
                          <Send className="size-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(a.id)} title="Delete">
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'green' | 'orange'
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-dotted opacity-60 pointer-events-none" aria-hidden />
      <CardContent className="relative flex flex-col gap-2 py-1">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span
          className={
            'font-display text-3xl tracking-tight ' +
            (tone === 'green'
              ? 'text-[color:var(--brand-green)]'
              : tone === 'orange'
                ? 'text-[color:var(--brand-orange)]'
                : '')
          }
        >
          {value}
        </span>
      </CardContent>
    </Card>
  )
}
