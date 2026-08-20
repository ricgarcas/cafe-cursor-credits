import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { AdminContent, SidebarProvider } from '@/components/admin/sidebar-context'
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
  if (user.mustChangePassword) redirect('/change-password')

  await ensureDefaultSettings()
  const [settings] = await db.select().from(appSettings).limit(1)
  if (!settings || !settings.onboarded) redirect('/onboarding')

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background">
        <AdminSidebar
          user={{ email: user.email, name: user.name, role: user.role }}
          city={settings.cityName}
          claimEnabled={settings.claimEnabled}
        />
        <AdminContent>
          <AdminHeader user={{ email: user.email, name: user.name, role: user.role }} />
          <main className="p-6 md:p-8">{children}</main>
        </AdminContent>
      </div>
    </SidebarProvider>
  )
}
