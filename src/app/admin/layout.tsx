import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { currentUser } from '@/lib/auth/users'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await currentUser()
  if (!user) redirect('/login')

  await ensureDefaultSettings()
  const [settings] = await db.select().from(appSettings).limit(1)
  if (!settings || !settings.onboarded) redirect('/onboarding')

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar user={{ email: user.email, name: user.name }} />
      <div className="lg:pl-64">
        <AdminHeader user={{ email: user.email, name: user.name }} />
        <main className="p-6 md:p-8">{children}</main>
      </div>
    </div>
  )
}
