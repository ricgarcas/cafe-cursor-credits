import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, ensureDefaultSettings } from '@/lib/db/client'
import { appSettings } from '@/lib/db/schema'
import { requireUser } from '@/lib/auth/guard'

export async function PATCH(request: NextRequest) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const parsed = z.object({ dismissed: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  await ensureDefaultSettings()
  await db.update(appSettings).set({ checklistDismissed: parsed.data.dismissed, updatedAt: new Date().toISOString() })
  return NextResponse.json({ success: true })
}
