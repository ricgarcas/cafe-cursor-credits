import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiKey, listApiKeys } from '@/lib/auth/api-key'
import { requireUser } from '@/lib/auth/guard'

export async function GET() {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const rows = await listApiKeys()
  return NextResponse.json({
    api_keys: rows.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.keyPrefix,
      role: k.role,
      last_used_at: k.lastUsedAt,
      revoked_at: k.revokedAt,
      created_at: k.createdAt,
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.enum(['admin', 'host']),
})

export async function POST(request: NextRequest) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { record, key } = await createApiKey({ ...parsed.data, createdBy: gate.user.id })
  // `key` is returned exactly once — it is not recoverable afterwards.
  return NextResponse.json({
    success: true,
    api_key: { id: record.id, name: record.name, key_prefix: record.keyPrefix, role: record.role },
    key,
  })
}
