import { redirect } from 'next/navigation'

// Luma integration is currently disabled
// To re-enable: restore this page and add "Luma Events" back to sidebar navigation

export default function LumaPage() {
  redirect('/admin/dashboard')
}
