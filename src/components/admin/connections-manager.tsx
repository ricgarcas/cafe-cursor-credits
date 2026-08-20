'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Plus, Trash2, Plug, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatEventDate } from '@/lib/event-date'

type ClientRow = {
  id: number
  client_id: string
  name: string
  scope: string
  is_confidential: boolean
  grant_types: string[]
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

type Issued = { client_id: string; client_secret: string; scope: string }

export function ConnectionsManager() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/oauth-clients')
    if (!res.ok) return
    setClients((await res.json()).clients ?? [])
  }, [])

  useEffect(() => {
    // load() only setStates after an await — not the synchronous cascade the rule guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const create = async () => {
    const res = await fetch('/api/admin/oauth-clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || 'Could not create client')
      return
    }
    setIssued(json)
    setName('')
    setCreateOpen(false)
    load()
  }

  const revoke = async (row: ClientRow) => {
    if (!confirm(`Revoke "${row.name}"? Any session using it stops working immediately.`)) return
    const res = await fetch(`/api/admin/oauth-clients/${row.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Connection revoked')
      load()
    } else toast.error('Could not revoke')
  }

  const copySecret = async () => {
    if (!issued) return
    await navigator.clipboard.writeText(issued.client_secret)
    setCopied(true)
    toast.success('Secret copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const active = clients.filter((c) => !c.revoked_at)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New machine client
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <Plug className="size-5" />
          <p className="text-sm">Nothing connected yet.</p>
          <p className="max-w-sm text-sm">
            Add this deployment to Cursor and click Connect — it registers itself and
            appears here once you approve it.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {c.is_confidential ? 'machine' : 'cursor'}
                  </Badge>
                </TableCell>
                <TableCell className="font-code text-xs text-muted-foreground">
                  {c.scope.replace(/cafecursor:/g, '')}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {c.last_used_at ? formatEventDate(c.last_used_at.slice(0, 10)) : 'never'}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => revoke(c)} title="Revoke">
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New machine client</DialogTitle>
            <DialogDescription>
              For CI or cron. Cursor does not need this — it connects itself over OAuth.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="client-name">Name</Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nightly Luma sync"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button shape="pill" onClick={create} disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(issued)} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy the secret now</DialogTitle>
            <DialogDescription>
              This is the only time it is shown. Exchange it for a token at{' '}
              <span className="font-code">/oauth/token</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Client ID</Label>
              <div className="rounded-[10px] border border-border bg-background p-3 font-code text-xs break-all select-all">
                {issued?.client_id}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Client secret</Label>
              <div className="rounded-[10px] border border-border bg-background p-3 font-code text-xs break-all select-all">
                {issued?.client_secret}
              </div>
            </div>
            <div className="rounded-[10px] border border-border bg-muted/40 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Terminal className="size-3.5" /> Get a token
              </p>
              <pre className="overflow-x-auto font-code text-[11px] leading-relaxed">
{`curl -X POST /oauth/token \\
  -d grant_type=client_credentials \\
  -d client_id=${issued?.client_id ?? ''} \\
  -d client_secret=…`}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copySecret}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              Copy secret
            </Button>
            <Button shape="pill" onClick={() => setIssued(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
