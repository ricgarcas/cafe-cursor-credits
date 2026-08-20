import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PublicShell } from '@/components/public/shell'
import { CursorGuide } from '@/components/docs/cursor-guide'

export const metadata = {
  title: 'Run it from Cursor — Cafe Cursor',
  description:
    'Connect this deployment to Cursor over MCP and set up, run, and troubleshoot an event by describing what you want.',
}

/** Public mirror of /admin/guide, so the README can link it without a login. */
export default function CursorGuidePage() {
  return (
    <PublicShell
      title="Run it from Cursor"
      tagline="Connect this deployment once, then set up and run an event by describing what you want."
      width="wide"
    >
      <CursorGuide />
      <div className="pt-8">
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Settings
        </Link>
      </div>
    </PublicShell>
  )
}
