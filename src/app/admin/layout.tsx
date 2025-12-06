import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { Toaster } from '@/components/ui/sonner'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="dark min-h-screen bg-background">
      <AdminSidebar user={user} />
      <div className="lg:pl-64">
        <AdminHeader user={user} />
        <main className="p-6">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  )
}

