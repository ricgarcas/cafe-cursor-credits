'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Search, Send, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

type FilterStatus = 'all' | 'with_coupon' | 'without_coupon'

/** Event-lens row — `id` is the participation id. */
type AttendeeRow = {
  id: number
  name: string
  email: string
  registered_at: string | null
  coupon_code: string | null
}

interface Props {
  initialAttendees: AttendeeRow[]
}

export function DashboardAttendeesTable({ initialAttendees }: Props) {
  const [attendees, setAttendees] = useState<AttendeeRow[]>(initialAttendees)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 9

  const fetchSeq = useRef(0)
  const fetchAttendees = useCallback(async () => {
    const seq = ++fetchSeq.current
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    try {
      const res = await fetch(`/api/admin/attendees?${params.toString()}`)
      const json = await res.json()
      if (seq !== fetchSeq.current) return
      setAttendees(json.attendees ?? [])
      setCurrentPage(1)
    } catch {
      if (seq === fetchSeq.current) toast.error('Failed to load attendees')
    } finally {
      if (seq === fetchSeq.current) setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    if (search || statusFilter !== 'all') {
      const t = setTimeout(fetchAttendees, search ? 250 : 0)
      return () => clearTimeout(t)
    }
    fetchSeq.current++ // invalidate any in-flight search response
    setAttendees(initialAttendees)
  }, [search, statusFilter, fetchAttendees, initialAttendees])

  const handleSendEmail = async (participationId: number) => {
    try {
      const res = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participation_id: participationId }),
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

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this attendee from the event?')) return
    const res = await fetch(`/api/admin/attendees/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Removed')
      fetchAttendees()
    } else {
      toast.error('Failed to remove')
    }
  }

  const totalPages = Math.max(1, Math.ceil(attendees.length / itemsPerPage))
  const pageSlice = attendees.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  )

  return (
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
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All attendees</SelectItem>
              <SelectItem value="with_coupon">With code</SelectItem>
              <SelectItem value="without_coupon">Without code</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading…</div>
        ) : attendees.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No attendees yet</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
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
                      {a.coupon_code ? (
                        <Badge variant="secondary" className="font-code text-[11px]">
                          {a.coupon_code.slice(0, 20)}
                          {a.coupon_code.length > 20 ? '…' : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {a.registered_at ? format(new Date(a.registered_at), 'MMM d, HH:mm') : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleSendEmail(a.id)}
                        disabled={!a.coupon_code}
                        title="Resend email"
                      >
                        <Send className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(a.id)}
                        title="Delete"
                      >
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
  )
}
