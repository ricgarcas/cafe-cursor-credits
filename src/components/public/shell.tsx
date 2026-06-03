'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CursorCube } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { PublicBackdrop } from '@/components/public/backdrop'

type PublicSettings = {
  city_name: string
  event_tagline?: string | null
  claim_enabled?: boolean
}

export function usePublicSettings() {
  const [settings, setSettings] = useState<PublicSettings>({ city_name: 'Cafe Cursor' })
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSettings(data))
      .catch(() => {})
  }, [])
  return settings
}

/**
 * Cursor-inspired public page shell. The interactive dot-grid backdrop
 * spans the full viewport so the footer floats over it too. Footer is
 * optional so pages that want a different chrome can opt out.
 */
export function PublicShell({
  eyebrow,
  title,
  tagline,
  children,
  footer = true,
}: {
  eyebrow?: string
  title: ReactNode
  tagline?: string
  children: ReactNode
  footer?: boolean
}) {
  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground">
      {/* Fixed so it covers the whole viewport, including the footer area. */}
      <PublicBackdrop />

      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 md:px-8 py-12 md:py-20">
        <div className="w-full max-w-md flex flex-col items-center">
          <CursorCube className="size-12 mb-4 opacity-90" />
          {eyebrow ? (
            <span className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="size-1 rounded-full bg-[color:var(--brand-orange)]" />
              {eyebrow}
            </span>
          ) : null}
          <h1 className="font-display text-4xl md:text-5xl text-center leading-[1.05] tracking-[-0.02em]">
            {title}
          </h1>
          {tagline ? (
            <p className="mt-4 text-center text-muted-foreground text-[16px] md:text-[17px] max-w-[34ch] leading-relaxed">
              {tagline}
            </p>
          ) : null}

          <div className="mt-10 w-full">{children}</div>
        </div>
      </main>

      {footer ? (
        <footer className="relative z-10 py-8 flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <a
            href="https://cursor.com"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Cursor"
          >
            <CursorCube className="size-5" />
          </a>
          <span>
            Built for the{' '}
            <a
              href="https://cursor.com/community"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline hover:text-foreground"
            >
              Cursor Ambassador Community
            </a>
            .
          </span>
        </footer>
      ) : null}
    </div>
  )
}
