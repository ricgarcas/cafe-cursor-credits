'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { toast } from 'sonner'
import { 
  RefreshCw, 
  Users, 
  Calendar, 
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  Loader2,
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
  is_sync_enabled: boolean
  last_synced_at: string | null
}

export function LumaEventsManagement() {
  const [events, setEvents] = useState<LumaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncingEvents, setSyncingEvents] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/luma/events')
      const data = await response.json()
      setEvents(data.events || [])
    } catch (error) {
      toast.error('Failed to load Luma events')
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
      await Promise.all([fetchEvents(), checkConnection()])
    })()
  }, [fetchEvents, checkConnection])

  const handleSyncEvents = async () => {
    setSyncingEvents(true)
    try {
      const response = await fetch('/api/admin/luma/sync-events', {
        method: 'POST',
      })
      const data = await response.json()

      if (data.success) {
        toast.success(`Synced ${data.eventsSynced} events from Luma`)
        fetchEvents()
      } else {
        toast.error(data.errors?.[0] || 'Failed to sync events')
      }
    } catch (error) {
      toast.error('Failed to sync events')
      console.error(error)
    }
    setSyncingEvents(false)
  }

  const handleSyncGuests = async (eventId: string) => {
    setSyncing(eventId)
    try {
      const response = await fetch('/api/admin/luma/sync-guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(
          `Synced ${data.guestsSynced} guests. ` +
          `Added: ${data.guestsAdded}, Updated: ${data.guestsUpdated}, ` +
          `Coupons assigned: ${data.couponsAssigned}`
        )
        fetchEvents()
      } else {
        toast.error(data.errors?.[0] || 'Failed to sync guests')
      }
    } catch (error) {
      toast.error('Failed to sync guests')
      console.error(error)
    }
    setSyncing(null)
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
            <Button
              variant="outline"
              onClick={handleSyncEvents}
              disabled={syncingEvents || connectionStatus !== 'connected'}
            >
              {syncingEvents ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Events
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Luma Events</CardTitle>
          <CardDescription>
            Events synced from your Luma calendar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No events found. Click &quot;Sync Events&quot; to fetch from Luma.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{event.name}</span>
                        {event.url && (
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            <LinkIcon className="h-3 w-3" />
                            View on Luma
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{format(new Date(event.start_at), 'MMM d, yyyy')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{event.guest_count}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.last_synced_at
                        ? formatDistanceToNow(new Date(event.last_synced_at), { addSuffix: true })
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleSyncGuests(event.luma_event_id)}
                        disabled={syncing === event.luma_event_id}
                      >
                        {syncing === event.luma_event_id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sync Guests
                      </Button>
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

