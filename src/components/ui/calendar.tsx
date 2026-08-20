'use client'

import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/** react-day-picker wired to our tokens: flat surfaces, pill selection. */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center h-8',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1 absolute inset-x-3 top-3 justify-between pointer-events-none',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'pointer-events-auto opacity-60 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'pointer-events-auto opacity-60 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday:
          'text-muted-foreground rounded-md w-9 font-normal text-[11px] uppercase tracking-wider',
        week: 'flex w-full mt-1.5',
        day: 'size-9 p-0 text-center text-sm',
        day_button: cn(
          'size-9 rounded-full p-0 font-normal transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ),
        selected:
          '[&>button]:bg-foreground [&>button]:text-background [&>button]:hover:bg-foreground [&>button]:hover:text-background',
        today: '[&>button]:border [&>button]:border-border',
        outside: 'text-muted-foreground/40',
        disabled: 'text-muted-foreground/30',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  )
}
