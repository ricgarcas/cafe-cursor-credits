'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  event: { id: number; name: string; eventDate: string | null; claimPasscode: string | null }
}

export function EditEventDialog({ event }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(event.name)
  const [date, setDate] = useState(event.eventDate ?? '')
  const [passcode, setPasscode] = useState(event.claimPasscode ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          event_date: date.trim() || null,
          claim_passcode: passcode.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Could not save')
      }
      toast.success('Event updated')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} title="Edit event">
        <Pencil className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
            <DialogDescription>Name, date, and the passcode shown at the venue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ev-name">Event name</Label>
              <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-date">Date</Label>
              <DateField id="ev-date" value={date} onChange={setDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-passcode">Claim passcode</Label>
              <Input
                id="ev-passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Leave empty for an open portal"
                className="font-code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button shape="pill" onClick={save} disabled={saving || !name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
