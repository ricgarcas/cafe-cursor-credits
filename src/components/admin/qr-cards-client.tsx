'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Printer, QrCode, Check } from 'lucide-react'
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
  tagline,
}: {
  codes: Code[]
  city: string
  tagline?: string
}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [limit, setLimit] = useState(Math.min(codes.length, 9))
  const [cutStack, setCutStack] = useState(true)
  const [qrMap, setQrMap] = useState<Record<number, string>>({})

  const visible = useMemo(() => {
    const clipped = codes.slice(0, Math.max(0, Math.min(limit, codes.length)))
    return cutStack ? reorderForCutStack(clipped, 9) : clipped
  }, [codes, limit, cutStack])

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
            margin: 1,
            width: 512,
            color: { dark: fg, light: bg },
            errorCorrectionLevel: 'M',
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

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-6">
          <div className="min-w-[140px]">
            <Label className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Codes available
            </Label>
            <div className="font-display text-2xl">{codes.length}</div>
          </div>

          <div className="min-w-[160px] flex-1">
            <Label htmlFor="limit" className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              How many to print
            </Label>
            <Input
              id="limit"
              type="number"
              min={0}
              max={codes.length}
              value={limit}
              onChange={(e) => setLimit(Math.min(codes.length, Math.max(0, Number(e.target.value) || 0)))}
            />
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
                Cut &amp; stack
              </Button>
              <Button
                type="button"
                variant={!cutStack ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCutStack(false)}
              >
                Sequential
              </Button>
            </div>
          </div>

          <div className="ml-auto">
            <Button onClick={() => window.print()} disabled={visible.length === 0}>
              <Printer className="size-4" /> Print / Save PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview / print surface. Tailwind .print-sheet prints 3x3 per A4. */}
      <div className="print-sheet">
        <style jsx global>{`
          @media print {
            @page { size: A4; margin: 10mm; }
            body { background: white !important; }
            body > :not(.print-sheet),
            .print-sheet ~ * { display: none !important; }
            aside, header { display: none !important; }
            .print-sheet { padding: 0 !important; background: white !important; }
            .qr-card { break-inside: avoid; page-break-inside: avoid; }
          }
        `}</style>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 print:grid-cols-3 print:gap-3">
          {visible.map((c, i) => {
            const isDark = theme === 'dark'
            return (
              <div
                key={c.id}
                className={
                  'qr-card relative aspect-[3/4] rounded-[14px] overflow-hidden border flex flex-col ' +
                  (isDark
                    ? 'bg-[#141417] border-[#2a2a2f] text-white'
                    : 'bg-white border-[#E5E1D7] text-[#1a1a1a]')
                }
              >
                {/* Card header */}
                <div className="px-5 pt-5 flex items-center justify-between text-[10px] uppercase tracking-[0.18em]">
                  <span className="inline-flex items-center gap-1.5 opacity-80">
                    <CursorCube className="size-3.5" />
                    Cafe Cursor
                  </span>
                  <span className="font-code opacity-60">#{String(i + 1).padStart(3, '0')}</span>
                </div>

                {/* QR */}
                <div className="flex-1 flex items-center justify-center px-5">
                  {qrMap[c.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrMap[c.id]}
                      alt="QR code"
                      className="w-full max-w-[180px] aspect-square"
                    />
                  ) : (
                    <div className="w-full max-w-[180px] aspect-square rounded-md bg-current opacity-5" />
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-5">
                  <div className="text-[11px] uppercase tracking-[0.14em] opacity-60 mb-1">
                    {city}
                  </div>
                  <div
                    className={
                      'font-tagline leading-tight ' + (isDark ? 'text-white/90' : 'text-[#1a1a1a]')
                    }
                  >
                    {tagline || 'Scan to claim your Cursor credits.'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {visible.length === 0 && (
          <Card className="mt-6">
            <CardContent className="py-10 flex flex-col items-center text-center gap-2 text-muted-foreground">
              <QrCode className="size-6" />
              <p className="font-medium text-foreground">No cards to preview</p>
              <p className="text-sm">
                Add unused coupon codes to inventory, or increase the &quot;how many&quot; count.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
