'use client'

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'cc:sidebar-collapsed'

/**
 * Tiny external store so the collapsed flag can be read during render without
 * a post-mount setState, and stays in sync across tabs.
 */
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

const getSnapshot = () => window.localStorage.getItem(STORAGE_KEY) === '1'
const getServerSnapshot = () => false

type Ctx = { collapsed: boolean; toggle: () => void }
const SidebarContext = createContext<Ctx>({ collapsed: false, toggle: () => {} })

export const useSidebar = () => useContext(SidebarContext)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggle = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, getSnapshot() ? '0' : '1')
    emit()
  }, [])

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>
}

/** Offsets page content by the current rail width. */
export function AdminContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  return (
    <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
      {children}
    </div>
  )
}
