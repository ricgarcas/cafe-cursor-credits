import { Suspense } from 'react'
import { AttendeeManagement } from '@/components/admin/attendee-management'

export const dynamic = 'force-dynamic'

export default function AttendeesPage() {
  return (
    <div className="space-y-6 mt-3">
      <div>
        <h1 className="text-2xl font-medium font-sans">Attendees</h1>
        <p className="text-muted-foreground">Manage registered attendees and their coupon codes</p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <AttendeeManagement />
      </Suspense>
    </div>
  )
}

