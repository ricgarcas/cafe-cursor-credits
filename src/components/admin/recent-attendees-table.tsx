'use client'

import { AttendeeWithCoupon } from '@/types/database'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface RecentAttendeesTableProps {
  attendees: AttendeeWithCoupon[]
}

export function RecentAttendeesTable({ attendees }: RecentAttendeesTableProps) {
  if (attendees.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No registrations yet
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800 hover:bg-transparent">
          <TableHead className="text-zinc-400">Name</TableHead>
          <TableHead className="text-zinc-400">Email</TableHead>
          <TableHead className="text-zinc-400">Coupon</TableHead>
          <TableHead className="text-zinc-400">Registered</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {attendees.map((attendee) => (
          <TableRow key={attendee.id} className="border-zinc-800 hover:bg-zinc-800/50">
            <TableCell className="text-white font-medium">{attendee.name}</TableCell>
            <TableCell className="text-zinc-400">{attendee.email}</TableCell>
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
            <TableCell className="text-zinc-500">
              {formatDistanceToNow(new Date(attendee.registered_at), { addSuffix: true })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

