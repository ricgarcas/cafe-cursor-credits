'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AttendeeWithCoupon } from '@/types/database'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Search, Send, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

type FilterStatus = 'all' | 'with_coupon' | 'without_coupon'

interface DashboardAttendeesTableProps {
  initialAttendees: AttendeeWithCoupon[]
}

export function DashboardAttendeesTable({ initialAttendees }: DashboardAttendeesTableProps) {
  const [attendees, setAttendees] = useState<AttendeeWithCoupon[]>(initialAttendees)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 9

  const supabase = createClient()

  const fetchAttendees = useCallback(async () => {
    setLoading(true)
    
    let query = supabase
      .from('attendees')
      .select(`*, coupon_codes (*)`)
      .order('registered_at', { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    if (statusFilter === 'with_coupon') {
      query = query.not('coupon_code_id', 'is', null)
    } else if (statusFilter === 'without_coupon') {
      query = query.is('coupon_code_id', null)
    }

    const { data, error } = await query

    if (error) {
      toast.error('Failed to load attendees')
      console.error(error)
    } else {
      setAttendees(data || [])
      setCurrentPage(1)
    }

    setLoading(false)
  }, [supabase, search, statusFilter])

  useEffect(() => {
    if (search || statusFilter !== 'all') {
      fetchAttendees()
    } else {
      setAttendees(initialAttendees)
    }
  }, [search, statusFilter, fetchAttendees, initialAttendees])

  const handleSendEmail = async (attendeeId: number) => {
    const attendee = attendees.find((a) => a.id === attendeeId)
    if (!attendee?.coupon_codes) {
      toast.error('This attendee does not have a coupon code assigned')
      return
    }

    try {
      const response = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId }),
      })

      if (!response.ok) {
        throw new Error('Failed to send email')
      }

      toast.success('Email sent successfully!')
    } catch {
      toast.error('Failed to send email')
    }
  }

  const handleDeleteAttendee = async (attendeeId: number) => {
    if (!confirm('Are you sure you want to delete this attendee?')) return

    const { error } = await supabase
      .from('attendees')
      .delete()
      .eq('id', attendeeId)

    if (error) {
      toast.error('Failed to delete attendee')
    } else {
      toast.success('Attendee deleted')
      fetchAttendees()
    }
  }

  // Pagination
  const totalPages = Math.ceil(attendees.length / itemsPerPage)
  const paginatedAttendees = attendees.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <h2 className="text-lg font-light">All Attendees</h2>
          <div className="flex flex-1 gap-3 md:justify-end">
            <div className="relative flex-1 md:flex-initial md:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Attendees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Attendees</SelectItem>
                <SelectItem value="with_coupon">With Coupon</SelectItem>
                <SelectItem value="without_coupon">Without Coupon</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : attendees.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No attendees found</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 font-medium">Name</TableHead>
                  <TableHead className="text-zinc-400 font-medium">Email</TableHead>
                  <TableHead className="text-zinc-400 font-medium">Registered</TableHead>
                  <TableHead className="text-zinc-400 font-medium">Coupon</TableHead>
                  <TableHead className="text-zinc-400 font-medium text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAttendees.map((attendee) => (
                  <TableRow key={attendee.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="text-white font-medium">{attendee.name}</TableCell>
                    <TableCell className="text-zinc-400">{attendee.email}</TableCell>
                    <TableCell className="text-zinc-400">
                      {format(new Date(attendee.registered_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      {attendee.coupon_codes ? (
                        <Badge variant="outline" className="bg-emerald-950/50 text-emerald-400 border-emerald-800">
                          {attendee.coupon_codes.code}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-zinc-800 text-zinc-500 border-zinc-700">
                          None
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {attendee.coupon_codes && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSendEmail(attendee.id)}
                            title="Send email"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteAttendee(attendee.id)}
                          title="Delete attendee"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, attendees.length)} of {attendees.length} results
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 text-xs"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  &lt;
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant="outline"
                    size="icon"
                    className={`h-7 w-7 text-xs ${currentPage === page ? 'bg-muted' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 text-xs"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  &gt;
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
