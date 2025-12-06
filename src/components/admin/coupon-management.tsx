'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CouponCode } from '@/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, MoreHorizontal, Pencil, Trash2, Ticket, CheckCircle, XCircle } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

export function CouponManagement() {
  const [coupons, setCoupons] = useState<CouponCode[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    used: 0,
    available: 0,
  })
  const [newCode, setNewCode] = useState('')
  const [editingCoupon, setEditingCoupon] = useState<CouponCode | null>(null)
  const [editCode, setEditCode] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [bulkCodes, setBulkCodes] = useState('')
  const [isBulkOpen, setIsBulkOpen] = useState(false)

  const supabase = createClient()

  const fetchCoupons = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('coupon_codes')
      .select()
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load coupons')
      console.error(error)
    } else {
      setCoupons(data || [])
    }

    setLoading(false)
  }, [supabase])

  const fetchStats = useCallback(async () => {
    const [
      { count: total },
      { count: used },
      { count: available },
    ] = await Promise.all([
      supabase.from('coupon_codes').select('*', { count: 'exact', head: true }),
      supabase.from('coupon_codes').select('*', { count: 'exact', head: true }).eq('is_used', true),
      supabase.from('coupon_codes').select('*', { count: 'exact', head: true }).eq('is_used', false),
    ])

    setStats({
      total: total || 0,
      used: used || 0,
      available: available || 0,
    })
  }, [supabase])

  useEffect(() => {
    fetchCoupons()
    fetchStats()
  }, [fetchCoupons, fetchStats])

  const handleCreateCoupon = async () => {
    if (!newCode.trim()) {
      toast.error('Please enter a coupon code')
      return
    }

    const { error } = await supabase
      .from('coupon_codes')
      .insert({ code: newCode.trim().toUpperCase() })

    if (error) {
      if (error.code === '23505') {
        toast.error('This coupon code already exists')
      } else {
        toast.error('Failed to create coupon')
      }
    } else {
      toast.success('Coupon created successfully')
      setNewCode('')
      setIsCreateOpen(false)
      fetchCoupons()
      fetchStats()
    }
  }

  const handleBulkImport = async () => {
    const codes = bulkCodes
      .split('\n')
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code.length > 0)

    if (codes.length === 0) {
      toast.error('Please enter at least one coupon code')
      return
    }

    const { error } = await supabase
      .from('coupon_codes')
      .insert(codes.map((code) => ({ code })))

    if (error) {
      if (error.code === '23505') {
        toast.error('Some coupon codes already exist')
      } else {
        toast.error('Failed to import coupons')
      }
    } else {
      toast.success(`${codes.length} coupons imported successfully`)
      setBulkCodes('')
      setIsBulkOpen(false)
      fetchCoupons()
      fetchStats()
    }
  }

  const handleEditCoupon = async () => {
    if (!editingCoupon || !editCode.trim()) return

    const { error } = await supabase
      .from('coupon_codes')
      .update({ code: editCode.trim().toUpperCase() })
      .eq('id', editingCoupon.id)

    if (error) {
      if (error.code === '23505') {
        toast.error('This coupon code already exists')
      } else {
        toast.error('Failed to update coupon')
      }
    } else {
      toast.success('Coupon updated successfully')
      setEditingCoupon(null)
      setEditCode('')
      setIsEditOpen(false)
      fetchCoupons()
    }
  }

  const handleDeleteCoupon = async (couponId: number) => {
    const coupon = coupons.find((c) => c.id === couponId)
    if (coupon?.is_used) {
      toast.error('Cannot delete a used coupon')
      return
    }

    if (!confirm('Are you sure you want to delete this coupon?')) return

    const { error } = await supabase
      .from('coupon_codes')
      .delete()
      .eq('id', couponId)

    if (error) {
      toast.error('Failed to delete coupon')
    } else {
      toast.success('Coupon deleted')
      fetchCoupons()
      fetchStats()
    }
  }

  const openEditDialog = (coupon: CouponCode) => {
    setEditingCoupon(coupon)
    setEditCode(coupon.code)
    setIsEditOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="text-lg font-light">Total Coupons</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="text-lg font-light">Used</CardDescription>
            <CardTitle className="text-2xl">{stats.used}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="text-lg font-light">Available</CardDescription>
            <CardTitle className="text-2xl">{stats.available}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-light">Coupon Codes</CardTitle>
          <div className="flex gap-2">
            <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Bulk Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Import Coupons</DialogTitle>
                  <DialogDescription>
                    Enter coupon codes, one per line.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="bulk-codes">Coupon Codes</Label>
                  <textarea
                    id="bulk-codes"
                    value={bulkCodes}
                    onChange={(e) => setBulkCodes(e.target.value)}
                    placeholder="CURSOR-ABC123&#10;CURSOR-DEF456&#10;CURSOR-GHI789"
                    rows={8}
                    className="mt-2 w-full rounded-md bg-background border border-input p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsBulkOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleBulkImport}>
                    Import
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Coupon
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Coupon Code</DialogTitle>
                  <DialogDescription>
                    Enter a unique coupon code to add to the system.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="code">Coupon Code</Label>
                  <Input
                    id="code"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="CURSOR-ABC123"
                    className="mt-2"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateCoupon}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-zinc-500">Loading...</div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">No coupon codes yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Code</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Used At</TableHead>
                  <TableHead className="text-zinc-400">Created</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow key={coupon.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="text-white font-mono">{coupon.code}</TableCell>
                    <TableCell>
                      {coupon.is_used ? (
                        <Badge variant="outline" className="bg-emerald-950/50 text-emerald-400 border-emerald-800">
                          Used
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-950/50 text-blue-400 border-blue-800">
                          Available
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {coupon.used_at
                        ? format(new Date(coupon.used_at), 'MMM d, yyyy HH:mm')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDistanceToNow(new Date(coupon.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      {!coupon.is_used && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-white">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                            <DropdownMenuItem
                              onClick={() => openEditDialog(coupon)}
                              className="text-zinc-300 focus:bg-zinc-800 focus:text-white cursor-pointer"
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteCoupon(coupon.id)}
                              className="text-red-400 focus:bg-red-950/50 focus:text-red-300 cursor-pointer"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Coupon Code</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update the coupon code value.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="edit-code" className="text-zinc-300">Coupon Code</Label>
            <Input
              id="edit-code"
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
              className="mt-2 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </Button>
            <Button onClick={handleEditCoupon} className="bg-zinc-100 text-zinc-900 hover:bg-white">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

