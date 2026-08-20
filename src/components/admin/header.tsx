'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
type AdminUser = { email: string; name?: string; role?: string }
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut, Menu, Sparkles } from 'lucide-react'
import { navigation } from './sidebar'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/theme-toggle'

interface Props {
  user: AdminUser
}

export function AdminHeader({ user }: Props) {
  const router = useRouter()
  const pathname = usePathname()

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
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm lg:hidden">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" shape="pill" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60" align="start">
              {navigation
                .filter((item) => !item.adminOnly || user.role !== 'host')
                .map((item) => (
                  <DropdownMenuItem key={item.name} asChild className="cursor-pointer gap-3">
                    <Link
                      href={item.href}
                      className={cn(pathname.startsWith(item.href) && 'font-medium')}
                    >
                      <item.icon className="size-4" />
                      {item.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer gap-3">
                <Link href="/claim">
                  <Sparkles className="size-4 text-[color:var(--brand-green)]" />
                  On-site claim portal
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Wordmark />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" shape="pill">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-muted text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
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
        </div>
      </div>
    </header>
  )
}
