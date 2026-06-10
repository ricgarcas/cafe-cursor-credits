'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Ticket,
  LogOut,
  Settings,
  Sparkles,
  QrCode,
  CalendarDays,
  UserPlus,
} from 'lucide-react'
type AdminUser = { email: string; name?: string; role?: string }
import { Button } from '@/components/ui/button'
import { EventSwitcher } from './event-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Wordmark } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme-toggle'

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Attendees', href: '/admin/attendees', icon: Users },
  { name: 'Coupons', href: '/admin/coupons', icon: Ticket },
  { name: 'QR cards', href: '/admin/qr-cards', icon: QrCode },
  { name: 'Luma', href: '/admin/luma', icon: CalendarDays },
  { name: 'Team', href: '/admin/team', icon: UserPlus, adminOnly: true },
  { name: 'Settings', href: '/admin/settings', icon: Settings, adminOnly: true },
]

interface Props {
  user: AdminUser
  city?: string
}

export function AdminSidebar({ user, city }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const initials =
    user.email
      ?.split('@')[0]
      .split('.')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'AD'

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <div className="flex min-h-0 flex-1 flex-col bg-sidebar border-r border-sidebar-border">
        <div className="px-5 h-16 flex items-center border-b border-sidebar-border">
          <Wordmark city={city} />
        </div>

        <EventSwitcher canManage={user.role !== 'host'} />

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navigation
            .filter((item) => !item.adminOnly || user.role !== 'host')
            .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-3 h-9 rounded-full text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="mx-3 mb-3">
          <Link
            href="/claim"
            className="block rounded-[10px] border border-sidebar-border bg-[color:var(--brand-green-soft)] px-3 py-2.5 text-xs leading-snug text-sidebar-foreground hover:bg-[color:var(--brand-green-soft)]/70 transition-colors"
          >
            <div className="flex items-center gap-2 font-medium text-sidebar-foreground">
              <Sparkles className="size-3.5 text-[color:var(--brand-green)]" />
              On-site claim portal
            </div>
            <div className="mt-0.5 text-sidebar-foreground/70">
              Attendees get codes instantly, no email needed.
            </div>
          </Link>
        </div>

        <div className="border-t border-sidebar-border p-3 flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" shape="rounded" className="flex-1 justify-start gap-3 h-auto py-1.5 px-2">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left min-w-0">
                  <span className="text-sm font-medium">Admin</span>
                  <span className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">
                    {user.email}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start" side="top">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Admin</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <LogOut className="mr-2 size-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
