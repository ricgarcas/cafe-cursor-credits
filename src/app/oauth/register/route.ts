import { NextResponse } from 'next/server'
import { z } from 'zod'
import { registerPublicClient, pruneStaleClients, parseRedirectUris } from '@/lib/oauth/clients'
import { SCOPE_READ, SCOPE_WRITE } from '@/lib/oauth/config'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit'

const schema = z.object({
  client_name: z.string().min(1).max(120).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
})

/**
 * RFC 7591 dynamic client registration, open by design.
 *
 * Registration alone grants nothing: /oauth/authorize still requires an
 * admin to log in and approve. Rows that never complete a grant are pruned
 * after 24h, so an open endpoint cannot accumulate junk indefinitely.
 */
export async function POST(request: Request) {
  if (!rateLimit(`dcr:${clientIp(request)}`)) return tooManyRequests()

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris is required and must contain valid absolute URLs.',
      },
      { status: 400 },
    )
  }

  // Loopback redirects are how native clients like Cursor receive the code.
  // Anything else must be https, or a code could be sent over the wire raw.
  const bad = parsed.data.redirect_uris.find((uri) => {
    const u = new URL(uri)
    const loopback = u.hostname === '127.0.0.1' || u.hostname === '::1' || u.hostname === 'localhost'
    return u.protocol !== 'https:' && !loopback && u.protocol !== 'cursor:'
  })
  if (bad) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description: `Redirect URIs must use https or loopback. Got: ${bad}`,
      },
      { status: 400 },
    )
  }

  await pruneStaleClients().catch(() => {})

  const client = await registerPublicClient({
    name: parsed.data.client_name ?? 'Unnamed MCP client',
    redirectUris: parsed.data.redirect_uris,
    scope: parsed.data.scope ?? `${SCOPE_READ} ${SCOPE_WRITE}`,
  })

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.name,
      redirect_uris: parseRedirectUris(client),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: client.scope,
      client_id_issued_at: Math.floor(new Date(client.createdAt).getTime() / 1000),
    },
    { status: 201 },
  )
}
