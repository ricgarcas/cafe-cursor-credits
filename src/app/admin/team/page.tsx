import { TeamClient } from '@/components/admin/team-client'

export const dynamic = 'force-dynamic'

export default function TeamPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Team</h1>
        <p className="mt-1 text-muted-foreground">
          Admins run everything; hosts get the day-of tools.
        </p>
      </div>
      <TeamClient />
    </div>
  )
}
