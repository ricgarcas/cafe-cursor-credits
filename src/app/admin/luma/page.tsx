import { LumaEventsManagement } from '@/components/admin/luma-events-management'

export default function LumaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Luma Integration</h1>
        <p className="text-muted-foreground">
          Connect to a Luma event and sync guests
        </p>
      </div>
      <LumaEventsManagement />
    </div>
  )
}

