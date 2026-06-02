import { redirect } from 'next/navigation'
import { countUsers } from '@/lib/auth/users'

// First open (no admin yet) → bootstrap the owner via /admin-register, which
// auto-logs them in and forwards to /onboarding. Otherwise, public attendees
// land on /register.
export default async function Home() {
  const hasAdmin = (await countUsers()) > 0
  redirect(hasAdmin ? '/register' : '/admin-register')
}
