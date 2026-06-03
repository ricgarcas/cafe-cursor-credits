import { cn } from "@/lib/utils"

/**
 * Cursor cube — official 2D logomark from the Cursor brand kit.
 * Uses currentColor so it adapts to theme (dark on light bg, light on dark bg).
 */
export function CursorCube({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 466.73 532.09"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6", className)}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
      />
    </svg>
  )
}

/**
 * Wordmark — SVG first, then tight-tracked caps. Matches Cursor navbar.
 * Optionally append a city name in muted tone.
 */
export function Wordmark({
  city,
  className,
}: {
  city?: string
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-3 text-foreground/80", className)}>
      <CursorCube className="size-6 shrink-0" />
      <div className="leading-tight tracking-[-0.015em]">
        <div className="text-[18px]">Cafe Cursor</div>
        {city ? (
          <div className="text-[13px] text-muted-foreground">{city}</div>
        ) : null}
      </div>
    </div>
  )
}
