'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Plus, Trash2, KeyRound } from 'lucide-react'
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

type KeyRow = {
  id: number
  name: string
  key_prefix: string
  role: 'admin' | 'host'
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'host'>('admin')
  const [issued, setIssued] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/api-keys')
    if (!res.ok) return
    setKeys((await res.json()).api_keys ?? [])
  }, [])

  useEffect(() => {
    // load() only setStates after an await — not the synchronous cascade the rule guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const create = async () => {
    const res = await fetch('/api/admin/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), role }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || 'Could not create key')
      return
    }
    setIssued(json.key)
    setName('')
    setCreateOpen(false)
    load()
  }

  const revoke = async (id: number) => {
    if (!confirm('Revoke this key? Any Cursor session using it stops working immediately.')) return
    const res = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Key revoked')
      load()
    } else toast.error('Could not revoke key')
  }

  const copy = async () => {
    if (!issued) return
    await navigator.clipboard.writeText(issued)
    setCopied(true)
    toast.success('Key copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New key
        </Button>
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <KeyRound className="size-5" />
          <p className="text-sm">No API keys yet. Create one to connect Cursor.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-code text-xs">{k.key_prefix}…</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {k.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {k.revoked_at
                    ? 'revoked'
                    : k.last_used_at
                      ? formatEventDate(k.last_used_at.slice(0, 10))
                      : 'never'}
                </TableCell>
                <TableCell className="text-right">
                  {k.revoked_at ? null : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => revoke(k.id)}
                      title="Revoke"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>For connecting Cursor to this deployment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ricardo's Cursor"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex gap-2">
                {(['admin', 'host'] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={role === r ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRole(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
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
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription>
              This is the only time it is shown. Paste it into Cursor&apos;s MCP settings.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[10px] border border-border bg-background p-3 font-code text-xs break-all select-all">
            {issued}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              Copy key
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
