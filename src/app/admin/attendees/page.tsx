import { Suspense } from 'react'
import { AttendeeManagement } from '@/components/admin/attendee-management'
import { CsvImportDialog } from '@/components/admin/csv-import-dialog'

export const dynamic = 'force-dynamic'

export default function AttendeesPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Attendees</h1>
          <p className="text-muted-foreground mt-1">
            Manage registrations and coupon assignments.
          </p>
        </div>
        <CsvImportDialog />
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
        <AttendeeManagement />
      </Suspense>
    </div>
  )
}
