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
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

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

export function LumaEventsManagement() {
  const [event, setEvent] = useState<LumaEvent | null>(null)
  const [eventId, setEventId] = useState('')
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')

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
      await Promise.all([fetchEvent(), checkConnection()])
    })()
  }, [fetchEvent, checkConnection])

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
          `Added: ${data.guestsAdded}, Updated: ${data.guestsUpdated}, ` +
          `Coupons assigned: ${data.couponsAssigned}`
        )
        fetchEvent()
      } else {
        toast.error(data.errors?.[0] || 'Failed to sync guests')
      }
    } catch (error) {
      toast.error('Failed to sync guests')
      console.error(error)
    }
    setSyncing(false)
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
                        <TableHead>Coupons</TableHead>
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
                          <TableCell>{log.coupons_assigned}</TableCell>
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
    </div>
  )
}
