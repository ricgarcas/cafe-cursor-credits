'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Search, Send, Ticket, Trash2, Download, Check, Pencil, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { csvCell } from '@/lib/csv'

type FilterStatus = 'all' | 'with_coupon' | 'without_coupon'

/** People-lens row — `id` is the person id. */
type PersonRow = {
  id: number
  name: string
  email: string
  events_attended: number
  first_seen: string | null
  last_seen: string | null
}

/** Event-lens row — `id` is the participation id, not the person id. */
type AttendeeRow = {
  id: number
  attendee_id: number
  name: string
  email: string
  source: 'manual' | 'luma' | 'website'
  registered_at: string | null
  checked_in_at: string | null
  email_status: 'sent' | 'failed' | 'skipped' | null
  email_error: string | null
  coupon_code: string | null
}

export function AttendeeManagement() {
  const [view, setView] = useState<'event' | 'people'>('event')
  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [people, setPeople] = useState<PersonRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [editing, setEditing] = useState<AttendeeRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const itemsPerPage = 9

  // Monotonic sequence — a slow stale response must not clobber a newer one.
  const fetchSeq = useRef(0)
  const fetchAttendees = useCallback(async () => {
    const seq = ++fetchSeq.current
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    params.set('limit', '1000')
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

  const fetchPeople = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/attendees?view=people')
      const json = await res.json()
      setPeople(json.people ?? [])
    } catch {
      toast.error('Failed to load people')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'people') {
      fetchPeople()
      return
    }
    // Debounced — typing shouldn't fire a request per keystroke.
    const t = setTimeout(fetchAttendees, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [view, search, fetchAttendees, fetchPeople])

  const stats = useMemo(() => {
    const withCoupons = attendees.filter((a) => a.coupon_code).length
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
        body: JSON.stringify({ participation_id: id }),
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
        body: JSON.stringify({ participation_id: id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Code assigned')
      fetchAttendees()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign')
    }
  }

  const toggleCheckIn = async (row: AttendeeRow) => {
    const next = row.checked_in_at ? null : new Date().toISOString()
    setAttendees((prev) => prev.map((a) => (a.id === row.id ? { ...a, checked_in_at: next } : a)))
    const res = await fetch(`/api/admin/attendees/${row.id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked_in: Boolean(next) }),
    })
    if (!res.ok) {
      toast.error('Could not update check-in')
      fetchAttendees()
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Remove this attendee from the event?')) return
    const res = await fetch(`/api/admin/attendees/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Removed')
      fetchAttendees()
    } else toast.error('Failed to remove')
  }

  const openEdit = (row: AttendeeRow) => {
    setEditing(row)
    setEditName(row.name)
    setEditEmail(row.email)
  }

  const saveEdit = async () => {
    if (!editing) return
    const res = await fetch(`/api/admin/attendees/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, email: editEmail }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || 'Could not save')
      return
    }
    setEditing(null)
    toast.success('Saved')
    fetchAttendees()
  }

  const reassign = async (id: number) => {
    if (!confirm('Assign a fresh code? The old one stays used — it already went out.')) return
    const res = await fetch(`/api/admin/attendees/${id}/reassign`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || 'Could not reassign')
      return
    }
    toast.success(`New code: ${json.code}`)
    fetchAttendees()
  }

  const removePerson = async (p: PersonRow) => {
    if (!confirm(`Removes ${p.name} and their history from every event. This is permanent.`)) return
    const res = await fetch(`/api/admin/attendees/${p.id}?person=true`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Person removed')
      fetchPeople()
    } else toast.error('Failed to remove')
  }

  const exportPeopleCsv = () => {
    const headers = ['Name', 'Email', 'Events attended', 'First seen', 'Last seen']
    const rows = people.map((p) => [p.name, p.email, p.events_attended, p.first_seen, p.last_seen])
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `people-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportCsv = () => {
    const headers = ['Name', 'Email', 'Registered At', 'Code', 'Source']
    const rows = attendees.map((a) => [
      a.name,
      a.email,
      a.registered_at,
      a.coupon_code ?? '',
      a.source,
    ])
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
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
      <Tabs value={view} onValueChange={(v) => setView(v as 'event' | 'people')}>
        <TabsList>
          <TabsTrigger value="event">This event</TabsTrigger>
          <TabsTrigger value="people">All people</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'people' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {people.length} {people.length === 1 ? 'person' : 'people'} across all events
              </span>
              <Button variant="outline" onClick={exportPeopleCsv}>
                <Download className="size-4" /> Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading…</div>
            ) : people.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No people yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>First seen</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell>{p.events_attended}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.first_seen ? format(new Date(p.first_seen), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.last_seen ? format(new Date(p.last_seen), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon-sm" onClick={() => removePerson(p)} title="Delete person">
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
      <>
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
                  <TableHead>Check-in</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSlice.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        {a.email}
                        <EmailStatusDot status={a.email_status} error={a.email_error} />
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {a.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.coupon_code ? (
                        <span className="font-code text-xs">
                          {a.coupon_code.slice(0, 24)}
                          {a.coupon_code.length > 24 ? '…' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={a.checked_in_at ? 'brandFilled' : 'ghost'}
                        size="sm"
                        shape="pill"
                        onClick={() => toggleCheckIn(a)}
                        title={a.checked_in_at ? 'Checked in' : 'Check in'}
                      >
                        <Check className="size-3.5" />
                        {a.checked_in_at ? format(new Date(a.checked_in_at), 'HH:mm') : 'Check in'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {a.registered_at ? format(new Date(a.registered_at), 'MMM d, HH:mm') : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(a)} title="Edit">
                        <Pencil className="size-4" />
                      </Button>
                      {!a.coupon_code ? (
                        <Button variant="ghost" size="icon-sm" onClick={() => assignCoupon(a.id)} title="Assign code">
                          <Ticket className="size-4" />
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon-sm" onClick={() => sendEmail(a.id)} title="Resend email">
                            <Send className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => reassign(a.id)} title="Reassign code">
                            <RefreshCw className="size-4" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(a.id)} title="Remove from event">
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {attendees.length >= 1000 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing the first 1000 — narrow your search to see the rest.
              </p>
            )}
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
      </>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit attendee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button shape="pill" onClick={saveEdit} disabled={!editName.trim() || !editEmail.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmailStatusDot({ status, error }: { status: string | null; error: string | null }) {
  if (!status) return null
  if (status === 'failed') {
    // Failed sends are the one state an organizer must catch — make it loud.
    const label = `Email failed: ${error ?? 'unknown'}`
    return (
      <Badge
        variant="outline"
        title={label}
        aria-label={label}
        className="border-destructive/40 text-destructive text-[10px] uppercase tracking-wider"
      >
        email failed
      </Badge>
    )
  }
  const tone = status === 'sent' ? 'bg-[color:var(--brand-green)]' : 'bg-muted-foreground/40'
  const label = `Email ${status}`
  return <span title={label} aria-label={label} className={`inline-block size-1.5 rounded-full ${tone}`} />
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
