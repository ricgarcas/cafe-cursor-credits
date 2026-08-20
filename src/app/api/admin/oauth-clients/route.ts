import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'
import { createConfidentialClient, listClients, parseGrantTypes } from '@/lib/oauth/clients'
import { parseScopes, SCOPE_READ, SCOPE_WRITE } from '@/lib/oauth/config'

export async function GET() {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response
  const clients = await listClients()
  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      client_id: c.clientId,
      name: c.name,
      scope: c.scope,
      is_confidential: c.isConfidential,
      grant_types: parseGrantTypes(c),
      last_used_at: c.lastUsedAt,
      revoked_at: c.revokedAt,
      created_at: c.createdAt,
    })),
  })
}

const schema = z.object({
  name: z.string().min(1).max(120),
  scope: z.string().optional(),
})

/** Creates a confidential client for CI or cron — the headless path. */
export async function POST(request: Request) {
  const gate = await requireUser({ role: 'admin' })
  if ('response' in gate) return gate.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'A name is required' }, { status: 400 })
  }
  const scopes = parseScopes(parsed.data.scope)
  const { record, clientSecret } = await createConfidentialClient({
    name: parsed.data.name.trim(),
    scope: (scopes.length ? scopes : [SCOPE_READ, SCOPE_WRITE]).join(' '),
    createdBy: gate.user.id,
  })
  return NextResponse.json(
    {
      client_id: record.clientId,
      client_secret: clientSecret,
      scope: record.scope,
      token_endpoint: '/oauth/token',
    },
    { status: 201 },
  )
}
export const dynamic = 'force-dynamic'
