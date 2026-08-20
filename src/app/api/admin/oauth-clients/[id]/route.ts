import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guard'
import { revokeClient } from '@/lib/oauth/clients'

/** Revoking a client also kills its live tokens, so Cursor stops immediately. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const { id } = await params
  const ok = await revokeClient(Number(id))
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
