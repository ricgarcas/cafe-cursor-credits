import { CursorGuide } from '@/components/docs/cursor-guide'

export const metadata = {
  title: 'Run it from Cursor — Cafe Cursor',
}

export default function AdminGuidePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Run it from Cursor</h1>
        <p className="mt-2 text-muted-foreground">
          Connect this deployment once, then set up and run an event by describing
          what you want.
        </p>
      </div>
      <CursorGuide />
    </div>
  )
}
