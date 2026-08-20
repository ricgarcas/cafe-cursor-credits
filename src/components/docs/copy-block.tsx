'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A code block whose whole point is being pasted somewhere else, so the copy
 * affordance is always visible rather than hover-only — on touch there is no
 * hover, and this page is often read on a phone at a venue.
 */
export function CopyBlock({
  code,
  label,
  className,
}: {
  code: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-[10px] border border-border bg-muted/40', className)}>
      {label && (
        <div className="border-b border-border px-4 py-2 font-code text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={label ? { top: 'calc(0.5rem + 2.25rem)' } : undefined}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      <pre className="overflow-x-auto p-4 pr-12 font-code text-[13px] leading-relaxed">
        {code}
      </pre>
    </div>
  )
}
