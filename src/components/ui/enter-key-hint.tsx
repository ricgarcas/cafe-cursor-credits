import { CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Tiny keyboard chip rendered inside a primary button to signal that
 * pressing Enter triggers it. Hidden on small screens where the affordance
 * is irrelevant (no physical keyboard).
 */
export function EnterKeyHint({ className }: { className?: string }) {
  return (
    <kbd
      aria-hidden
      className={cn(
        'ml-1 hidden sm:inline-flex items-center justify-center h-5 min-w-5 px-1',
        'rounded-[5px] border border-current/30 opacity-70',
        'font-sans leading-none',
        className,
      )}
    >
      <CornerDownLeft className="size-3" strokeWidth={2} />
      <span className="sr-only">Press Enter</span>
    </kbd>
  )
}
