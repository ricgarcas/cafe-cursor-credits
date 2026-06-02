import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/users'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await currentUser()
  if (!user) redirect('/login')
  return <div className="min-h-screen bg-background">{children}</div>
}
