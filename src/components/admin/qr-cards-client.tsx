'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import QRCode from 'qrcode'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Printer, QrCode, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { CursorCube } from '@/components/brand/logo'
import { reorderForCutStack } from '@/lib/qr-layout'

type Code = { id: number; code: string }

function toRedeemUrl(code: string): string {
  if (/^https?:\/\//i.test(code)) return code
  return `https://cursor.com/referral?code=${encodeURIComponent(code)}`
}

export function QrCardsClient({
  codes,
  city,
  eventName,
}: {
  codes: Code[]
  city: string
  eventName?: string
}) {
  const { resolvedTheme } = useTheme()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [perPage, setPerPage] = useState(9)
  const [limit, setLimit] = useState(Math.min(codes.length, 9))
  const [cutStack, setCutStack] = useState(true)
  const [qrMap, setQrMap] = useState<Record<number, string>>({})
  const [view, setView] = useState(0)

  // Default the card theme to the app's active scheme until the user picks one.
  const themePicked = useRef(false)
  useEffect(() => {
    if (themePicked.current) return
    if (resolvedTheme === 'dark' || resolvedTheme === 'light') {
      setTheme(resolvedTheme)
      setQrMap({})
    }
  }, [resolvedTheme])

  // Cards-per-page options and how each lays out on a portrait sheet [cols, rows].
  const PER_PAGE_LAYOUT: Record<number, [number, number]> = {
    1: [1, 1],
    2: [1, 2],
    4: [2, 2],
    6: [2, 3],
    9: [3, 3],
  }
  const [cols, rows] = PER_PAGE_LAYOUT[perPage] ?? [3, 3]

  const visible = useMemo(() => {
    const clipped = codes.slice(0, Math.max(0, Math.min(limit, codes.length)))
    return cutStack ? reorderForCutStack(clipped, perPage) : clipped
  }, [codes, limit, cutStack, perPage])

  // Chunk into one array of cards per physical page.
  const sheets = useMemo(() => {
    const out: Code[][] = []
    for (let i = 0; i < visible.length; i += perPage) {
      out.push(visible.slice(i, i + perPage))
    }
    return out
  }, [visible, perPage])

  const pages = sheets.length
  const orderMatters = pages > 1

  // Page-based quick presets: 1 page, 2 pages, … capped at what's available,
  // with the final option always being "all".
  const presets = useMemo(() => {
    const maxPages = Math.max(1, Math.ceil(codes.length / perPage))
    const values = new Set<number>()
    for (let p = 1; p <= Math.min(maxPages, 5); p++) {
      values.add(Math.min(p * perPage, codes.length))
    }
    values.add(codes.length)
    return Array.from(values).sort((a, b) => a - b)
  }, [codes.length, perPage])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<number, string> = {}
      const fg = theme === 'dark' ? '#F5F5F5' : '#111111'
      const bg = theme === 'dark' ? '#141417' : '#FFFFFF'
      for (const c of visible) {
        if (qrMap[c.id]) {
          next[c.id] = qrMap[c.id]
          continue
        }
        try {
          next[c.id] = await QRCode.toDataURL(toRedeemUrl(c.code), {
            margin: 2,
            width: 512,
            color: { dark: fg, light: bg },
            errorCorrectionLevel: 'H',
          })
        } catch {
          next[c.id] = ''
        }
      }
      if (!cancelled) setQrMap(next)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, theme])

  const isDark = theme === 'dark'

  const renderCard = (c: Code, globalIndex: number) => (
    <div
      key={c.id}
      className={
        'qr-card relative flex h-full w-full flex-col gap-[6%] rounded-[14px] border p-[9%] [container-type:inline-size] ' +
        (isDark
          ? 'bg-[#141417] border-[#2a2a2f] text-white'
          : 'bg-white border-[#E5E1D7] text-[#1a1a1a]')
      }
    >
      {/* Header — wordmark over the city + event in a lighter tone */}
      <div className="text-[clamp(10px,5cqw,16px)] leading-tight tracking-[-0.015em]">
        <div className="truncate">Cafe Cursor</div>
        {city ? <div className="truncate opacity-50">{city}</div> : null}
        {eventName ? <div className="truncate opacity-40">{eventName}</div> : null}
      </div>

      {/* QR with the Cursor cube notched into the center */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative aspect-square w-full max-w-[200px]">
          {qrMap[c.id] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrMap[c.id]} alt="QR code" className="h-full w-full" />
              <div
                className={
                  'absolute left-1/2 top-1/2 flex aspect-square w-[24%] -translate-x-1/2 -translate-y-1/2 items-center justify-center ' +
                  (isDark ? 'bg-[#141417]' : 'bg-white')
                }
              >
                <CursorCube
                  className={'size-[56%] ' + (isDark ? 'text-white' : 'text-black')}
                />
              </div>
            </>
          ) : (
            <div className="h-full w-full bg-current opacity-5" />
          )}
        </div>
      </div>

      {/* Card number — centered below the QR */}
      <div className="flex justify-center pt-0">
        <span className="font-code text-[clamp(11px,5cqw,18px)] font-medium tracking-tight">
          #{String(globalIndex + 1).padStart(3, '0')}
        </span>
      </div>
    </div>
  )

  // One sheet's worth of cards in the configured N-up grid.
  const sheetGrid = (cards: Code[], offset: number) => (
    <div
      className="grid h-full w-full gap-[4%]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {cards.map((c, i) => renderCard(c, offset + i))}
    </div>
  )

  // A single A4 sheet thumbnail with its page label.
  const renderSheet = (cards: Code[], s: number) => (
    <div key={s} className="flex flex-col items-center gap-2">
      <div
        className={
          'aspect-[1/1.414] w-full rounded-md border p-[5%] shadow-[0_2px_12px_rgba(0,0,0,0.10)] ' +
          (isDark ? 'bg-[#0a0a0b] border-[#2a2a2f]' : 'bg-white')
        }
      >
        {sheetGrid(cards, s * perPage)}
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        Page {s + 1} of {pages}
      </span>
    </div>
  )

  // Paginate the contact sheet only past 4 pages (4 sheets per view).
  const SHEETS_PER_VIEW = 4
  const paginated = pages > 4
  const totalViews = paginated ? Math.ceil(pages / SHEETS_PER_VIEW) : 1
  const v = Math.min(view, totalViews - 1)
  const start = paginated ? v * SHEETS_PER_VIEW : 0
  const shownSheets = paginated ? sheets.slice(start, start + SHEETS_PER_VIEW) : sheets

  return (
    <>
      {/* On-screen: macOS-style print dialog — sheet preview + settings rail. */}
      <div className="flex flex-col gap-6 lg:flex-row print:hidden">
        {/* Canvas with the A4 sheet + pager */}
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border bg-muted/40 p-6 sm:p-10">
          {sheets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <QrCode className="size-6" />
              <p className="font-medium text-foreground">No cards to preview</p>
              <p className="text-sm">Add unused coupon codes, or pick a count.</p>
            </div>
          ) : pages === 1 ? (
            <div className="w-full max-w-[440px]">{renderSheet(sheets[0], 0)}</div>
          ) : (
            <div className="flex w-full max-w-[680px] flex-col items-center gap-5">
              <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
                {shownSheets.map((cards, idx) => renderSheet(cards, start + idx))}
              </div>

              {paginated && (
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={v === 0}
                    onClick={() => setView((p) => Math.max(0, p - 1))}
                    aria-label="Previous pages"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    Pages {start + 1}–{start + shownSheets.length} of {pages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={v >= totalViews - 1}
                    onClick={() => setView((p) => Math.min(totalViews - 1, p + 1))}
                    aria-label="Next pages"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings rail */}
        <aside className="w-full lg:w-[280px] lg:shrink-0">
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Codes available
                </Label>
                <span className="font-display text-xl">{codes.length}</span>
              </div>

              <div className="h-px bg-border" />

              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  QR codes per page
                </Label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(PER_PAGE_LAYOUT).map(Number).map((n) => {
                    const [c, r] = PER_PAGE_LAYOUT[n]
                    return (
                      <Button
                        key={n}
                        type="button"
                        variant={perPage === n ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPerPage(n)}
                      >
                        {perPage === n && <Check className="size-3.5" />}
                        {n}
                        <span className="opacity-60">· {c}×{r}</span>
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  How many to print
                </Label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((value) => {
                    const p = Math.ceil(value / perPage)
                    const isAll = value === codes.length
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={limit === value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setLimit(value)}
                      >
                        {limit === value && <Check className="size-3.5" />}
                        {isAll ? `All ${value}` : value}
                        <span className="opacity-60">· {p} {p === 1 ? 'pg' : 'pgs'}</span>
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Card theme
                </Label>
                <div className="flex gap-2">
                  {(['dark', 'light'] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={theme === t ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        themePicked.current = true
                        setTheme(t)
                        setQrMap({})
                      }}
                    >
                      {theme === t && <Check className="size-3.5" />}
                      {t === 'dark' ? 'Dark' : 'Light'}
                    </Button>
                  ))}
                </div>
              </div>

              {orderMatters && (
                <div>
                  <Label className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Order
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={cutStack ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCutStack(true)}
                    >
                      {cutStack && <Check className="size-3.5" />}
                      Cut &amp; stack
                    </Button>
                    <Button
                      type="button"
                      variant={!cutStack ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCutStack(false)}
                    >
                      {!cutStack && <Check className="size-3.5" />}
                      Sequential
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                    {cutStack
                      ? 'Print, then cut each grid position and stack — cards land in 1→N order with no sorting.'
                      : 'Cards print in plain 1→N order, left to right.'}
                  </p>
                </div>
              )}

              <div className="h-px bg-border" />

              <div className="flex flex-col gap-1.5">
                <Button className="w-full" onClick={() => window.print()} disabled={visible.length === 0}>
                  <Printer className="size-4" /> Print / Save PDF
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  {visible.length === 0
                    ? 'Nothing to print'
                    : `${visible.length} ${visible.length === 1 ? 'card' : 'cards'} · ${pages} ${pages === 1 ? 'page' : 'pages'} (${cols}×${rows})`}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Print-only surface: one A4 sheet per page, hidden on screen. */}
      <div className="print-sheet hidden print:block">
        <style jsx global>{`
          @media print {
            @page { size: A4; margin: 10mm; }
            body { background: white !important; }
            /* Hide everything, then reveal only the print sheet. Works no
               matter how deeply .print-sheet is nested in the admin layout. */
            body * { visibility: hidden !important; }
            .print-sheet, .print-sheet * { visibility: visible !important; }
            .print-sheet {
              position: absolute;
              inset: 0 auto auto 0;
              width: 100%;
              padding: 0 !important;
              margin: 0 !important;
              background: white !important;
            }
            .print-page { break-inside: avoid; }
            .qr-card { break-inside: avoid; }
          }
        `}</style>

        {sheets.map((cards, s) => (
          <div
            key={s}
            className="print-page"
            style={{
              height: 'calc(297mm - 20mm)',
              breakAfter: s < sheets.length - 1 ? 'page' : 'auto',
            }}
          >
            {sheetGrid(cards, s * perPage)}
          </div>
        ))}
      </div>
    </>
  )
}
