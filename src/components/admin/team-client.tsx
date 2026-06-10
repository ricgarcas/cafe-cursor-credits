'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, Trash2, Copy, UserPlus } from 'lucide-react'
import { format } from 'date-fns'

type TeamUser = {
  id: number
  name: string
  email: string
  role: 'admin' | 'host'
  created_at: string
}

export function TeamClient() {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'host'>('host')
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      setUsers(json.users ?? [])
    } catch {
      toast.error('Failed to load team')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const create = async () => {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || 'Could not create member')
      return
    }
    setTempPassword(json.temp_password)
    setName('')
    setEmail('')
    setRole('host')
    fetchUsers()
  }

  const remove = async (u: TeamUser) => {
    if (!confirm(`Remove ${u.name}?`)) return
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json.error || 'Could not remove member')
      return
    }
    toast.success('Member removed')
    fetchUsers()
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setTempPassword(null)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {users.length} member{users.length === 1 ? '' : 's'}
          </span>
          <Button shape="pill" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Add member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'default' : 'outline'} className="text-[10px] uppercase tracking-wider">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(u)} title="Remove">
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(o) => (o ? setCreateOpen(true) : closeCreate())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              They&apos;ll get a one-time password and set their own on first sign-in.
            </DialogDescription>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Share this temporary password — it&apos;s shown once.
              </p>
              <div className="flex items-center gap-2 rounded-[10px] border border-border px-3 py-2">
                <span className="font-code flex-1 truncate">{tempPassword}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPassword)
                    toast.success('Copied')
                  }}
                  title="Copy"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button shape="pill" onClick={closeCreate}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="member-name">Name</Label>
                <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Co-host name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-email">Email</Label>
                <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cohost@email.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'host')}>
                  <SelectTrigger id="member-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="host">Host — day-of tools</SelectItem>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button shape="pill" onClick={create} disabled={!name.trim() || !email.trim()}>
                  <UserPlus className="size-4" /> Create
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
