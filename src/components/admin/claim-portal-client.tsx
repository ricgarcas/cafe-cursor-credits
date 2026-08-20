'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Check, Copy, ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { CursorCube } from '@/components/brand/logo'
import { formatEventDate } from '@/lib/event-date'

type Props = {
  claimUrl: string
  city: string
  eventName: string
  eventDate: string | null
  passcode: string | null
  enabled: boolean
  stats: { claimed: number; remaining: number }
}

export function ClaimPortalClient({ claimUrl, city, eventName, eventDate, passcode, enabled, stats }: Props) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)

  // Dark-on-white: scans reliably off a projector in any room light.
  useEffect(() => {
    QRCode.toDataURL(claimUrl, {
      margin: 1,
      width: 900,
      color: { dark: '#111111', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    })
      .then(setQr)
      .catch(() => toast.error('Could not render the QR'))
  }, [claimUrl])

  // Live-ish counters while the room is claiming.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 15_000)
    return () => clearInterval(t)
  }, [router])

  useEffect(() => {
    const onChange = () => setPresenting(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = async (next: boolean) => {
    setOn(next)
    const res = await fetch('/api/admin/claim-toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
    if (!res.ok) {
      setOn(!next)
      toast.error('Could not update the portal')
      return
    }
    toast.success(next ? 'Claim portal is open' : 'Claim portal is closed')
    router.refresh()
  }

  const copy = async () => {
    await navigator.clipboard.writeText(claimUrl)
    setCopied(true)
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const present = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else stageRef.current?.requestFullscreen?.()
  }

  const shortUrl = useMemo(() => claimUrl.replace(/^https?:\/\//, ''), [claimUrl])

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Stage — this is what goes on the projector. */}
      <div
        ref={stageRef}
        className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl border bg-background p-8 sm:p-12"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <CursorCube className="size-8 opacity-80" />
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Scan for your Cursor credits
          </h2>
          <p className="text-muted-foreground">
            Cafe Cursor <span className="font-tagline">{city}</span>
            {eventName === 'Cafe Cursor' || eventName === `Cafe Cursor ${city}` ? null : (
              <> · {eventName}</>
            )}
            {formatEventDate(eventDate) ? <> · {formatEventDate(eventDate)}</> : null}
          </p>
        </div>

        {on ? (
          <>
            <div className="rounded-[18px] border border-border bg-white p-4">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt={`QR code linking to ${claimUrl}`}
                  className="size-64 sm:size-80"
                />
              ) : (
                <div className="size-64 sm:size-80" />
              )}
            </div>

            <div className="flex flex-col items-center gap-3">
              <span className="font-code text-sm text-muted-foreground sm:text-base">
                {shortUrl}
              </span>
              {passcode ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Passcode
                  </span>
                  <span className="font-code text-4xl tracking-[0.2em] sm:text-5xl">
                    {passcode}
                  </span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="font-display text-2xl">The claim portal is closed</p>
            <p className="max-w-[42ch] text-muted-foreground">
              Attendees see a closed notice and can&apos;t claim a code. Open it
              when you&apos;re ready to hand out credits.
            </p>
          </div>
        )}

        <div className="flex items-baseline gap-6 text-sm text-muted-foreground">
          <span>
            <span className="font-display text-2xl text-foreground">{stats.claimed}</span> claimed
          </span>
          <span>
            <span className="font-display text-2xl text-foreground">{stats.remaining}</span> left
          </span>
        </div>
      </div>

      {/* Controls — hidden from the projector by living outside the stage. */}
      <aside className="w-full lg:w-[300px] lg:shrink-0">
        <Card>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="claim-open" className="text-sm font-medium">
                  Claim portal
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {on ? 'Open — attendees can claim' : 'Closed — claiming is blocked'}
                </p>
              </div>
              <Switch id="claim-open" checked={on} onCheckedChange={toggle} />
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={present}>
                {presenting ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                {presenting ? 'Exit presentation' : 'Present fullscreen'}
              </Button>
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copy claim link
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={claimUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> Open as an attendee
                </a>
              </Button>
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground">
              Project this on a screen at the venue. Counters refresh every 15
              seconds.
              {passcode
                ? ' The passcode keeps people outside the room from claiming.'
                : ' Add a passcode on the dashboard to stop people outside the room from claiming.'}
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
