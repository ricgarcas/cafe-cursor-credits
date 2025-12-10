import { LumaEventsManagement } from '@/components/admin/luma-events-management'

export default function LumaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Luma Events</h1>
        <p className="text-muted-foreground">
          Sync events and guests from your Luma calendar
        </p>
      </div>
      <LumaEventsManagement />
    </div>
  )
}

