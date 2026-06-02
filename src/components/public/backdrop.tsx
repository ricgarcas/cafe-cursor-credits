'use client'

import { useTheme } from 'next-themes'
import DotGrid from '@/components/DotGrid'

// Keep these in sync with --dot-base / --dot-active in globals.css.
// Read directly from resolvedTheme instead of getComputedStyle — the CSS-var
// round-trip lagged behind class toggles, leaving dark dots on a light canvas.
const DOTS = {
  light: { base: '#e2e2e2', active: '#b8b8b8' },
  dark: { base: '#3a3a3a', active: '#6a6a6a' },
}

function useDotColors() {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === 'dark' ? DOTS.dark : DOTS.light
}

/**
 * Fixed, pointer-interactive dot grid behind the public pages (login,
 * register, claim, admin-register). Uses react-bits DotGrid driven by our
 * theme tokens — dark dots on light canvas, inverted in dark mode.
 */
export function PublicBackdrop() {
  const { base, active } = useDotColors()

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden
    >
      <DotGrid
        dotSize={3}
        gap={22}
        baseColor={base}
        activeColor={active}
        proximity={90}
        speedTrigger={340}
        shockRadius={210}
        shockStrength={5}
        maxSpeed={2500}
        resistance={400}
        returnDuration={0.9}
      />
    </div>
  )
}
