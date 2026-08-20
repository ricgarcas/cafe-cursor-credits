'use client'

import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { eventDayLabel, formatEventDate, parseEventDate } from '@/lib/event-date'

/** Date → the `YYYY-MM-DD` the API stores, in local time (no UTC shift). */
function toIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

type Props = {
  /** `YYYY-MM-DD` or empty. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  className?: string
}

export function DateField({ value, onChange, placeholder = 'Pick a date', id, className }: Props) {
  const [open, setOpen] = useState(false)
  const selected = parseEventDate(value) ?? undefined
  const label = formatEventDate(value)
  const relative = eventDayLabel(value)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            shape="rounded"
            className={cn(
              'h-10 flex-1 justify-start gap-2 px-3 font-normal',
              !label && 'text-muted-foreground',
            )}
          >
            <CalendarDays className="size-4 shrink-0 opacity-70" />
            <span className="truncate">{label ?? placeholder}</span>
            {relative ? (
              <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {relative}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            autoFocus
            defaultMonth={selected}
            selected={selected}
            onSelect={(d) => {
              onChange(d ? toIsoDay(d) : '')
              setOpen(false)
            }}
          />
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(toIsoDay(new Date()))
                setOpen(false)
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {label ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange('')}
          title="Clear date"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}
