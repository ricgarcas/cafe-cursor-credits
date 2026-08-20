'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Checks = {
  eventReady: boolean
  hasCodes: boolean
  emailReady: boolean
  lumaConnected: boolean
}

const STEPS = [
  { key: 'eventReady', label: 'Set up your event', hint: 'Name and date it — pencil above', href: '/admin/dashboard' },
  { key: 'hasCodes', label: 'Add credit codes', hint: 'Paste your code batch', href: '/admin/coupons' },
  { key: 'emailReady', label: 'Configure email', hint: 'Resend or SMTP', href: '/admin/settings' },
  { key: 'lumaConnected', label: 'Connect Luma', hint: 'Optional — sync your guest list', href: '/admin/luma' },
] as const

export function GettingStarted({ checks }: { checks: Checks }) {
  const router = useRouter()
  const dismiss = async () => {
    await fetch('/api/admin/checklist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissed: true }),
    })
    router.refresh()
  }
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Getting started</span>
          <Button variant="ghost" shape="pill" size="sm" onClick={dismiss} className="text-muted-foreground">
            Dismiss
          </Button>
        </div>
        <ul className="space-y-2">
          {STEPS.map((s) => {
            const done = checks[s.key]
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border',
                    done ? 'border-[color:var(--brand-green)] text-[color:var(--brand-green)]' : 'border-border text-transparent',
                  )}
                >
                  <Check className="size-3" />
                </span>
                <Link href={s.href} className={cn('text-sm', done && 'text-muted-foreground line-through')}>
                  {s.label}
                </Link>
                <span className="text-xs text-muted-foreground">{s.hint}</span>
              </li>
            )
          })}
          <li className="flex items-center gap-2 pl-8 text-sm text-muted-foreground">
            Then:{' '}
            <Link href="/admin/qr-cards" className="underline underline-offset-4">print QR cards</Link> or{' '}
            <Link href="/admin/claim-portal" className="underline underline-offset-4">open the claim portal</Link>
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
