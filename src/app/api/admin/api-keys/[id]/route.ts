import { NextRequest, NextResponse } from 'next/server'
import { revokeApiKey } from '@/lib/auth/api-key'
import { requireUser } from '@/lib/auth/guard'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const { id } = await params
  const keyId = Number(id)
  if (!Number.isFinite(keyId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  if (!(await revokeApiKey(keyId))) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
