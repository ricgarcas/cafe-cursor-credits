'use client'

import { cn } from '@/lib/utils'

/** Dependency-free toggle switch matching the flat, pill aesthetic. */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors disabled:opacity-50',
        checked ? 'bg-foreground' : 'bg-muted',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-background transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}
