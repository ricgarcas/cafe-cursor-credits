'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LumaEvent } from '@/lib/db/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Zap, Plug, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

type EventWithStats = LumaEvent & {
  stats: { confirmed: number; claimed: number; emailed: number }
}

export function LumaClient({
  hasApiKey,
  initialEvents,
}: {
  hasApiKey: boolean
  initialEvents: EventWithStats[]
}) {
  const router = useRouter()
  const [events, setEvents] = useState(initialEvents)
  const [refreshing, setRefreshing] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null)

  if (!hasApiKey) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-5" /> Not connected
          </CardTitle>
          <CardDescription>
            Add your Luma API key in{' '}
            <Link href="/admin/settings" className="text-[color:var(--brand-orange)] hover:underline">
              Settings
            </Link>{' '}
            to enable event sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/admin/settings">
              Open settings <ExternalLink className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/luma/test-connection', { method: 'POST' })
      const json = await res.json()
      if (res.ok) setTestResult({ ok: true, msg: 'Connected.' })
      else setTestResult({ ok: false, msg: json.error || 'Failed' })
    } finally {
      setTesting(false)
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/luma/events', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setEvents(
        (json.events as EventWithStats[]).map((e) => ({
          ...e,
          stats: e.stats ?? { confirmed: 0, claimed: 0, emailed: 0 },
        })),
      )
      toast.success(`Refreshed — ${json.upserted} events`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh')
    } finally {
      setRefreshing(false)
    }
  }

  const syncEvent = async (eventApiId: string, dispatch: boolean) => {
    setSyncingId(eventApiId)
    try {
      const res = await fetch('/api/admin/luma/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventApiId, dispatch }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      const parts = [
        `${json.sync.upserted} guests synced`,
        `${json.sync.mirrored} new attendees`,
      ]
      if (json.dispatch) {
        parts.push(`${json.dispatch.assigned} codes assigned`)
        parts.push(`${json.dispatch.emailed} emails sent`)
      }
      toast.success(parts.join(' · '))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Connection strip */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 items-center justify-between py-1">
          <div className="flex items-center gap-3">
            <Plug className="size-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Luma API key configured</div>
              {testResult && (
                <div
                  className={
                    'text-xs mt-0.5 flex items-center gap-1.5 ' +
                    (testResult.ok ? 'text-[color:var(--brand-green)]' : 'text-destructive')
                  }
                >
                  {testResult.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                  {testResult.msg}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
              Test connection
            </Button>
            <Button size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh events
            </Button>
          </div>
        </CardContent>
      </Card>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>No events cached yet.</p>
            <p className="text-sm mt-1">Click &quot;Refresh events&quot; to pull the list from Luma.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((ev) => (
            <EventCard
              key={ev.apiId}
              event={ev}
              isSyncing={syncingId === ev.apiId}
              onSync={(dispatch) => syncEvent(ev.apiId, dispatch)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EventCard({
  event,
  isSyncing,
  onSync,
}: {
  event: EventWithStats
  isSyncing: boolean
  onSync: (dispatch: boolean) => void
}) {
  const start = event.startAt ? new Date(event.startAt) : null
  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{event.name}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {start && <span>{format(start, 'MMM d, yyyy · HH:mm')}</span>}
              {event.locationName && <span>· {event.locationName}</span>}
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {event.guestCount} guests
              </Badge>
            </CardDescription>
          </div>
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="View on Luma"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Confirmed" value={event.stats.confirmed} />
          <Stat label="Claimed" value={event.stats.claimed} tone="green" />
          <Stat label="Emailed" value={event.stats.emailed} tone="orange" />
        </div>
        {event.lastSyncedAt && (
          <p className="text-[11px] text-muted-foreground">
            Last synced {format(new Date(event.lastSyncedAt), 'MMM d, HH:mm')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isSyncing}
            onClick={() => onSync(false)}
          >
            {isSyncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Sync guests
          </Button>
          <Button size="sm" disabled={isSyncing} onClick={() => onSync(true)}>
            <Zap className="size-4" /> Sync &amp; dispatch credits
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'green' | 'orange'
}) {
  return (
    <div className="rounded-[10px] border border-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={
          'font-display text-xl tracking-tight ' +
          (tone === 'green'
            ? 'text-[color:var(--brand-green)]'
            : tone === 'orange'
              ? 'text-[color:var(--brand-orange)]'
              : '')
        }
      >
        {value}
      </div>
    </div>
  )
}
