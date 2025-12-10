'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { 
  RefreshCw, 
  Users, 
  Calendar, 
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  Loader2,
  Unlink,
  ExternalLink,
  Ticket,
  Mail,
  MoreHorizontal,
  Search,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { CouponCode } from '@/types/database'

interface LumaEvent {
  id: number
  luma_event_id: string
  name: string
  start_at: string
  end_at: string
  guest_count: number
  url: string | null
  last_synced_at: string | null
}

interface SyncLog {
  id: number
  status: 'started' | 'completed' | 'failed'
  guests_synced: number
  guests_added: number
  guests_updated: number
  coupons_assigned: number
  error_message: string | null
  created_at: string
}

interface LumaGuest {
  id: number
  luma_guest_id: string
  luma_event_id: string
  name: string
  email: string
  registration_status: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
  registered_at: string | null
  coupon_code_id: number | null
  email_sent_at: string | null
  coupon_codes: CouponCode | null
}

type GuestFilter = 'all' | 'no_coupon' | 'has_coupon' | 'email_sent'

export function LumaEventsManagement() {
  const [event, setEvent] = useState<LumaEvent | null>(null)
  const [eventId, setEventId] = useState('')
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [guests, setGuests] = useState<LumaGuest[]>([])
  const [loading, setLoading] = useState(true)
  const [guestsLoading, setGuestsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [guestFilter, setGuestFilter] = useState<GuestFilter>('all')
  const [guestSearch, setGuestSearch] = useState('')
  const [processingGuests, setProcessingGuests] = useState<Set<string>>(new Set())

  const fetchEvent = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/luma/events')
      const data = await response.json()
      setEvent(data.event || null)
      setSyncLogs(data.syncLogs || [])
      if (data.eventId) {
        setEventId(data.eventId)
      }
    } catch (error) {
      console.error(error)
    }
    setLoading(false)
  }, [])

  const fetchGuests = useCallback(async () => {
    setGuestsLoading(true)
    try {
      const response = await fetch('/api/admin/luma/guests')
      const data = await response.json()
      setGuests(data.guests || [])
    } catch (error) {
      console.error(error)
    }
    setGuestsLoading(false)
  }, [])

  const checkConnection = useCallback(async () => {
    setConnectionStatus('checking')
    try {
      const response = await fetch('/api/admin/luma/test-connection')
      const data = await response.json()
      setConnectionStatus(data.success ? 'connected' : 'disconnected')
    } catch {
      setConnectionStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await Promise.all([fetchEvent(), checkConnection(), fetchGuests()])
    })()
  }, [fetchEvent, checkConnection, fetchGuests])

  const handleSetEvent = async () => {
    if (!eventId.trim()) {
      toast.error('Please enter a Luma event ID or URL')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/luma/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: eventId.trim() }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(`Connected to event: ${data.event.name}`)
        fetchEvent()
        fetchGuests()
      } else {
        toast.error(data.error || 'Failed to connect event')
      }
    } catch (error) {
      toast.error('Failed to connect event')
      console.error(error)
    }
    setSaving(false)
  }

  const handleRemoveEvent = async () => {
    setRemoving(true)
    try {
      const response = await fetch('/api/admin/luma/events', {
        method: 'DELETE',
      })
      const data = await response.json()

      if (data.success) {
        toast.success('Event disconnected')
        setEvent(null)
        setEventId('')
        setSyncLogs([])
        setGuests([])
      } else {
        toast.error(data.error || 'Failed to disconnect event')
      }
    } catch (error) {
      toast.error('Failed to disconnect event')
      console.error(error)
    }
    setRemoving(false)
  }

  const handleSyncGuests = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/admin/luma/sync-guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(
          `Synced ${data.guestsSynced} guests. ` +
          `Added: ${data.guestsAdded}, Updated: ${data.guestsUpdated}`
        )
        fetchEvent()
        fetchGuests()
      } else {
        toast.error(data.errors?.[0] || 'Failed to sync guests')
      }
    } catch (error) {
      toast.error('Failed to sync guests')
      console.error(error)
    }
    setSyncing(false)
  }

  const handleAssignCoupon = async (lumaGuestId: string) => {
    setProcessingGuests(prev => new Set(prev).add(lumaGuestId))
    try {
      const response = await fetch('/api/admin/luma/guests/assign-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lumaGuestId }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(`Coupon ${data.couponCode} assigned!`)
        fetchGuests()
      } else {
        toast.error(data.error || 'Failed to assign coupon')
      }
    } catch (error) {
      toast.error('Failed to assign coupon')
      console.error(error)
    }
    setProcessingGuests(prev => {
      const next = new Set(prev)
      next.delete(lumaGuestId)
      return next
    })
  }

  const handleSendEmail = async (lumaGuestId: string) => {
    setProcessingGuests(prev => new Set(prev).add(lumaGuestId))
    try {
      const response = await fetch('/api/admin/luma/guests/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lumaGuestId }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success('Email sent successfully!')
        fetchGuests()
      } else {
        toast.error(data.error || 'Failed to send email')
      }
    } catch (error) {
      toast.error('Failed to send email')
      console.error(error)
    }
    setProcessingGuests(prev => {
      const next = new Set(prev)
      next.delete(lumaGuestId)
      return next
    })
  }

  // Filter and search guests
  const filteredGuests = guests.filter(guest => {
    // Apply status filter
    if (guestFilter === 'no_coupon' && guest.coupon_code_id) return false
    if (guestFilter === 'has_coupon' && !guest.coupon_code_id) return false
    if (guestFilter === 'email_sent' && !guest.email_sent_at) return false

    // Apply search
    if (guestSearch) {
      const search = guestSearch.toLowerCase()
      return (
        guest.name.toLowerCase().includes(search) ||
        guest.email.toLowerCase().includes(search)
      )
    }

    return true
  })

  // Stats for guests
  const guestStats = {
    total: guests.length,
    withCoupon: guests.filter(g => g.coupon_code_id).length,
    emailSent: guests.filter(g => g.email_sent_at).length,
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Luma Connection</CardTitle>
            <CardDescription>API connection status</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {connectionStatus === 'checking' && (
              <Badge variant="secondary">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Checking...
              </Badge>
            )}
            {connectionStatus === 'connected' && (
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {connectionStatus === 'disconnected' && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Event Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Luma Event</CardTitle>
          <CardDescription>
            Configure the Luma event to sync guests from
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : event ? (
            <div className="space-y-6">
              {/* Connected Event Info */}
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-lg">{event.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(event.start_at), 'MMM d, yyyy h:mm a')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {event.guest_count} guests
                      </span>
                    </div>
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View on Luma
                      </a>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {event.luma_event_id}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t">
                  <Button
                    onClick={handleSyncGuests}
                    disabled={syncing || connectionStatus !== 'connected'}
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Guests
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRemoveEvent}
                    disabled={removing}
                  >
                    {removing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                  {event.last_synced_at && (
                    <span className="text-sm text-muted-foreground ml-auto">
                      Last synced {formatDistanceToNow(new Date(event.last_synced_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              {/* Sync History */}
              {syncLogs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Recent Syncs</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Guests</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={log.status === 'completed' ? 'default' : log.status === 'failed' ? 'destructive' : 'secondary'}
                              className={log.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}
                            >
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {log.guests_synced} ({log.guests_added} new)
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No event connected. Enter a Luma event ID or URL to get started.
              </p>
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="eventId">Event ID or URL</Label>
                  <Input
                    id="eventId"
                    placeholder="e.g., evt-abc123 or lu.ma/abc123"
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSetEvent()}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleSetEvent}
                    disabled={saving || connectionStatus !== 'connected'}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <LinkIcon className="h-4 w-4 mr-2" />
                    )}
                    Connect
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Luma Guests Management */}
      {event && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Luma Guests</CardTitle>
                <CardDescription>
                  Manage coupon assignments and email sending for synced guests
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{guestStats.total}</span> total
                </span>
                <span className="text-muted-foreground">
                  <span className="font-medium text-emerald-500">{guestStats.withCoupon}</span> with coupon
                </span>
                <span className="text-muted-foreground">
                  <span className="font-medium text-blue-500">{guestStats.emailSent}</span> emailed
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={guestFilter} onValueChange={(v) => setGuestFilter(v as GuestFilter)}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Guests</SelectItem>
                  <SelectItem value="no_coupon">Without Coupon</SelectItem>
                  <SelectItem value="has_coupon">With Coupon</SelectItem>
                  <SelectItem value="email_sent">Email Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Guests Table */}
            {guestsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading guests...</div>
            ) : filteredGuests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {guests.length === 0
                  ? 'No guests synced yet. Click "Sync Guests" to import from Luma.'
                  : 'No guests match your filters.'}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Coupon</TableHead>
                    <TableHead>Email Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGuests.map((guest) => {
                    const isProcessing = processingGuests.has(guest.luma_guest_id)
                    const hasCoupon = !!guest.coupon_code_id
                    const emailSent = !!guest.email_sent_at

                    return (
                      <TableRow key={guest.id}>
                        <TableCell className="font-medium">{guest.name}</TableCell>
                        <TableCell className="text-muted-foreground">{guest.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={guest.registration_status === 'confirmed' ? 'default' : 'secondary'}
                            className={guest.registration_status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}
                          >
                            {guest.registration_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {guest.coupon_codes ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              {guest.coupon_codes.code}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">None</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {emailSent ? (
                            <span className="flex items-center gap-1 text-sm text-blue-500">
                              <CheckCircle className="h-3 w-3" />
                              Sent {formatDistanceToNow(new Date(guest.email_sent_at!), { addSuffix: true })}
                            </span>
                          ) : hasCoupon ? (
                            <span className="text-sm text-muted-foreground">Not sent</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" disabled={isProcessing}>
                                {isProcessing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!hasCoupon && (
                                <DropdownMenuItem
                                  onClick={() => handleAssignCoupon(guest.luma_guest_id)}
                                  className="cursor-pointer"
                                >
                                  <Ticket className="mr-2 h-4 w-4" />
                                  Assign Coupon
                                </DropdownMenuItem>
                              )}
                              {hasCoupon && !emailSent && (
                                <DropdownMenuItem
                                  onClick={() => handleSendEmail(guest.luma_guest_id)}
                                  className="cursor-pointer"
                                >
                                  <Mail className="mr-2 h-4 w-4" />
                                  Send Email
                                </DropdownMenuItem>
                              )}
                              {hasCoupon && emailSent && (
                                <DropdownMenuItem
                                  onClick={() => handleSendEmail(guest.luma_guest_id)}
                                  className="cursor-pointer"
                                >
                                  <Mail className="mr-2 h-4 w-4" />
                                  Resend Email
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
