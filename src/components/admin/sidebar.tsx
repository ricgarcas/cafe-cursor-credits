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
  Bot,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
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
import { CursorCube, Wordmark } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSidebar } from './sidebar-context'

export const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Attendees', href: '/admin/attendees', icon: Users },
  { name: 'Coupons', href: '/admin/coupons', icon: Ticket },
  { name: 'Claim portal', href: '/admin/claim-portal', icon: Sparkles },
  { name: 'QR cards', href: '/admin/qr-cards', icon: QrCode },
  { name: 'Luma', href: '/admin/luma', icon: CalendarDays },
  { name: 'Run from Cursor (MCP)', href: '/admin/guide', icon: Bot },
  { name: 'Team', href: '/admin/team', icon: UserPlus, adminOnly: true },
  { name: 'Settings', href: '/admin/settings', icon: Settings, adminOnly: true },
]

interface Props {
  user: AdminUser
  city?: string
  claimEnabled?: boolean
}

export function AdminSidebar({ user, city, claimEnabled = true }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { collapsed, toggle } = useSidebar()

  /** Wraps a control in a tooltip only while the rail is icon-only. */
  const withLabel = (label: string, node: React.ReactNode) =>
    collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={14}>
          {label}
        </TooltipContent>
      </Tooltip>
    ) : (
      node
    )

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
    <TooltipProvider>
    <aside
      className={cn(
        'hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-[width] duration-200',
        collapsed ? 'lg:w-16' : 'lg:w-64',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-sidebar border-r border-sidebar-border">
        <div
          className={cn(
            'h-16 flex items-center border-b border-sidebar-border',
            collapsed ? 'justify-center px-2' : 'justify-between pl-5 pr-2',
          )}
        >
          {collapsed ? (
            withLabel(
              city ? `Cafe Cursor ${city}` : 'Cafe Cursor',
              <Link href="/admin/dashboard" className="flex items-center justify-center">
                <CursorCube className="size-6 text-foreground/80" />
              </Link>,
            )
          ) : (
            <>
              <Wordmark city={city} />
              <Button
                variant="ghost"
                size="icon-sm"
                shape="rounded"
                onClick={toggle}
                aria-label="Collapse sidebar"
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </>
          )}
        </div>

        {collapsed ? (
          <div className="flex justify-center px-2 pt-3">
            {withLabel(
              'Expand sidebar',
              <Button
                variant="ghost"
                size="icon-sm"
                shape="rounded"
                onClick={toggle}
                aria-label="Expand sidebar"
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
              >
                <PanelLeftOpen className="size-4" />
              </Button>,
            )}
          </div>
        ) : (
          <EventSwitcher canManage={user.role !== 'host'} city={city} />
        )}

        <nav
          className={cn(
            'flex-1 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden',
            collapsed ? 'px-2' : 'px-3',
          )}
        >
          {navigation
            .filter((item) => !item.adminOnly || user.role !== 'host')
            .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <div key={item.name}>
                {withLabel(
                  item.name,
                  <Link
                    href={item.href}
                    aria-label={collapsed ? item.name : undefined}
                    className={cn(
                      'group flex items-center h-9 rounded-full text-sm transition-colors',
                      collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {collapsed ? null : item.name}
                  </Link>,
                )}
              </div>
            )
          })}
        </nav>

        <div className={cn('mb-3', collapsed ? 'mx-2' : 'mx-3')}>
          {collapsed ? (
            withLabel(
              claimEnabled ? 'Claim portal — open' : 'Claim portal — closed',
              <Link
                href="/admin/claim-portal"
                aria-label={claimEnabled ? 'Claim portal, open' : 'Claim portal, closed'}
                className="relative flex h-9 items-center justify-center rounded-full text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Sparkles className="size-4" />
                <span
                  className={cn(
                    'absolute right-1.5 top-1.5 size-1.5 rounded-full',
                    claimEnabled ? 'bg-[color:var(--brand-green)]' : 'bg-sidebar-foreground/40',
                  )}
                />
              </Link>,
            )
          ) : (
          <Link
            href="/admin/claim-portal"
            className="group block rounded-[10px] border border-sidebar-border px-3 py-2.5 transition-colors hover:bg-sidebar-accent"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-sidebar-foreground">Claim portal</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider',
                  claimEnabled ? 'text-[color:var(--brand-green)]' : 'text-sidebar-foreground/50',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    claimEnabled ? 'bg-[color:var(--brand-green)]' : 'bg-sidebar-foreground/40',
                  )}
                />
                {claimEnabled ? 'Open' : 'Closed'}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-sidebar-foreground/70">
              {claimEnabled
                ? 'Show the QR on screen at your venue'
                : 'Attendees can’t claim right now'}
              <ArrowRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </Link>
          )}
        </div>

        <div
          className={cn(
            'border-t border-sidebar-border p-3 flex items-center gap-2',
            collapsed && 'flex-col gap-1 px-2',
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {withLabel(
                user.email,
                <Button
                  variant="ghost"
                  shape="rounded"
                  aria-label="Account menu"
                  className={cn(
                    'h-auto py-1.5',
                    collapsed ? 'w-full justify-center px-0' : 'flex-1 justify-start gap-3 px-2',
                  )}
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {collapsed ? null : (
                    <div className="flex flex-col items-start text-left min-w-0">
                      <span className="text-sm font-medium">Admin</span>
                      <span className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">
                        {user.email}
                      </span>
                    </div>
                  )}
                </Button>,
              )}
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
    </TooltipProvider>
  )
}
