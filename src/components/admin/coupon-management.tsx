'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import QRCode from 'qrcode'
import type { CouponCode } from '@/lib/db/schema'

type CouponRow = CouponCode & { assigned_to: { name: string; email: string } | null }
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, CheckCircle2, Upload, QrCode, Copy, Check, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

function redeemUrl(code: string): string {
  if (/^https?:\/\//i.test(code)) return code
  return `https://cursor.com/referral?code=${encodeURIComponent(code)}`
}

export function CouponManagement() {
  const [coupons, setCoupons] = useState<CouponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newCode, setNewCode] = useState('')
  const [editing, setEditing] = useState<CouponRow | null>(null)
  const [editCode, setEditCode] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [bulkCodes, setBulkCodes] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [qrFor, setQrFor] = useState<CouponRow | null>(null)
  const [qrData, setQrData] = useState('')
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 9

  // Dark-on-white always — phone cameras scan that reliably in any app theme.
  useEffect(() => {
    if (!qrFor) return
    setQrData('')
    QRCode.toDataURL(redeemUrl(qrFor.code), {
      margin: 1,
      width: 512,
      color: { dark: '#111111', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then(setQrData)
      .catch(() => toast.error('Could not render the QR'))
  }, [qrFor])

  const copyToClipboard = async (value: string, which: 'code' | 'link') => {
    await navigator.clipboard.writeText(value)
    setCopied(which)
    toast.success(which === 'code' ? 'Code copied' : 'Link copied')
    setTimeout(() => setCopied(null), 2000)
  }

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/coupons')
      const json = await res.json()
      setCoupons(json.coupons ?? [])
      setCurrentPage(1)
    } catch {
      toast.error('Failed to load codes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  const stats = useMemo(() => {
    const used = coupons.filter((c) => c.isUsed).length
    return {
      total: coupons.length,
      used,
      available: coupons.length - used,
    }
  }, [coupons])

  const totalPages = Math.max(1, Math.ceil(coupons.length / itemsPerPage))
  const pageSlice = coupons.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  )

  const createOne = async () => {
    if (!newCode.trim()) return
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: newCode.trim() }),
    })
    if (res.ok) {
      toast.success('Code added')
      setNewCode('')
      setCreateOpen(false)
      fetchCoupons()
    } else {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Failed to add code')
    }
  }

  const createBulk = async () => {
    const codes = bulkCodes
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean)
    if (codes.length === 0) return
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes }),
    })
    if (res.ok) {
      const j = await res.json()
      toast.success(`Added ${j.inserted} · ${j.duplicates} duplicates skipped`)
      setBulkCodes('')
      setBulkOpen(false)
      fetchCoupons()
    } else {
      toast.error('Bulk import failed')
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const res = await fetch(`/api/admin/coupons/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: editCode.trim() }),
    })
    if (res.ok) {
      toast.success('Saved')
      setEditOpen(false)
      setEditing(null)
      fetchCoupons()
    } else {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Failed to save')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this code?')) return
    const res = await fetch(`/api/admin/coupons/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Deleted')
      fetchCoupons()
    } else toast.error('Failed to delete')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total codes" value={stats.total} />
        <StatCard label="Available" value={stats.available} tone="green" />
        <StatCard label="Used" value={stats.used} tone="orange" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2 justify-end">
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="size-4" /> Bulk add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk add codes</DialogTitle>
                  <DialogDescription>One code per line. Duplicates are skipped.</DialogDescription>
                </DialogHeader>
                <textarea
                  value={bulkCodes}
                  onChange={(e) => setBulkCodes(e.target.value)}
                  className="w-full min-h-[180px] rounded-[10px] border border-border bg-background p-3 font-code text-sm"
                  placeholder="AAAA-BBBB-CCCC&#10;XXXX-YYYY-ZZZZ"
                />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setBulkOpen(false)}>Cancel</Button>
                  <Button onClick={createBulk}>Add codes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> Add code
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a code</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="AAAA-BBBB-CCCC or full redeem URL"
                    className="font-code"
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={createOne}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Loading…</div>
          ) : coupons.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No codes yet. Use &quot;Bulk add&quot; to paste in a list.
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Used at</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSlice.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-code text-xs max-w-[320px] truncate">
                      {c.code}
                    </TableCell>
                    <TableCell>
                      {c.isUsed ? (
                        <Badge className="bg-[color:var(--brand-orange-soft)] text-[color:var(--brand-orange)] border border-[color:var(--brand-orange)]/20">
                          Used
                        </Badge>
                      ) : (
                        <Badge className="bg-[color:var(--brand-green-soft)] text-[color:var(--brand-green)] border border-[color:var(--brand-green)]/20">
                          <CheckCircle2 className="size-3" /> Available
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.assigned_to ? (
                        <span title={c.assigned_to.email}>{c.assigned_to.name}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.usedAt ? format(new Date(c.usedAt), 'MMM d, HH:mm') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.createdAt ? format(new Date(c.createdAt), 'MMM d') : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setQrFor(c)}
                        title="Show QR"
                      >
                        <QrCode className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditing(c)
                          setEditCode(c.code)
                          setEditOpen(true)
                        }}
                        disabled={c.isUsed}
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(c.id)}
                        disabled={c.isUsed}
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(qrFor)} onOpenChange={(o) => !o && setQrFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Show this to the attendee</DialogTitle>
            <DialogDescription>
              Scanning the QR opens the redeem link with the code applied.
            </DialogDescription>
          </DialogHeader>
          {qrFor && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-[14px] border border-border bg-white p-3">
                {qrData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrData} alt={`QR code for ${qrFor.code}`} className="size-56" />
                ) : (
                  <div className="size-56" />
                )}
              </div>
              <div className="font-code text-sm break-all text-center select-all">{qrFor.code}</div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(qrFor.code, 'code')}>
                  {copied === 'code' ? <Check className="size-4" /> : <Copy className="size-4" />}
                  Copy code
                </Button>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(redeemUrl(qrFor.code), 'link')}>
                  {copied === 'link' ? <Check className="size-4" /> : <Copy className="size-4" />}
                  Copy link
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={redeemUrl(qrFor.code)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" /> Open
                  </a>
                </Button>
              </div>
              {qrFor.isUsed && (
                <p className="text-xs text-muted-foreground text-center">
                  This code is marked as used{qrFor.assigned_to ? ` by ${qrFor.assigned_to.name}` : ''}{qrFor.usedAt ? ` (${format(new Date(qrFor.usedAt), 'MMM d, HH:mm')})` : ''} — only share it with the person it was assigned to.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit code</DialogTitle>
          </DialogHeader>
          <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="font-code" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'green' | 'orange'
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="relative flex flex-col gap-2 py-1">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span
          className={
            'font-display text-3xl tracking-tight ' +
            (tone === 'green'
              ? 'text-[color:var(--brand-green)]'
              : tone === 'orange'
                ? 'text-[color:var(--brand-orange)]'
                : '')
          }
        >
          {value}
        </span>
      </CardContent>
    </Card>
  )
}
