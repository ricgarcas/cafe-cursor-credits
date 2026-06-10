'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Plus, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type EventRow = {
  id: number
  name: string
  status: 'draft' | 'active' | 'archived'
  attendee_count: number
}

export function EventSwitcher({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPasscode, setNewPasscode] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/events')
    if (!res.ok) return
    const data = await res.json()
    setEvents(data.events)
    setSelectedId(data.selected_event_id)
    setActiveId(data.active_event_id)
  }, [])
  useEffect(() => {
    // load() only setStates after an await — not the synchronous cascade the rule guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const select = async (id: number) => {
    await fetch('/api/admin/selected-event', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: id }),
    })
    setSelectedId(id)
    router.refresh()
  }

  const create = async () => {
    const res = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, claim_passcode: newPasscode || undefined }),
    })
    if (!res.ok) {
      toast.error('Could not create event')
      return
    }
    const data = await res.json()
    setCreateOpen(false)
    setNewName('')
    setNewPasscode('')
    await load()
    await select(data.id)
    toast.success('Event created')
  }

  const selected = events.find((e) => e.id === selectedId)

  return (
    <div className="px-3 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" shape="rounded" className="w-full justify-between gap-2 h-9 px-3 border border-sidebar-border">
            <span className="flex items-center gap-2 min-w-0">
              <CalendarDays className="size-4 shrink-0" />
              <span className="truncate text-sm">{selected?.name ?? 'Event'}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60" align="start">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Events</DropdownMenuLabel>
          {events.map((e) => (
            <DropdownMenuItem key={e.id} onClick={() => select(e.id)} className="cursor-pointer gap-2">
              <Check className={cn('size-4', e.id === selectedId ? 'opacity-100' : 'opacity-0')} />
              <span className="flex-1 truncate">{e.name}</span>
              {e.id === activeId && (
                <span className="text-[10px] uppercase tracking-wider text-[color:var(--brand-green)]">live</span>
              )}
            </DropdownMenuItem>
          ))}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(ev) => { ev.preventDefault(); setCreateOpen(true) }} className="cursor-pointer gap-2">
                <Plus className="size-4" /> New event
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New event</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-name">Event name</Label>
              <Input id="event-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Cafe Cursor — July" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-passcode">Claim passcode</Label>
              <Input id="event-passcode" value={newPasscode} onChange={(e) => setNewPasscode(e.target.value)} placeholder="e.g. CAFE — leave empty for an open portal" className="font-code" />
            </div>
          </div>
          <DialogFooter>
            <Button shape="pill" onClick={create} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
