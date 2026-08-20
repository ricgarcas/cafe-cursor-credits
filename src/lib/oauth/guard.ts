import 'server-only'
import { NextResponse } from 'next/server'
import type { OAuthToken } from '@/lib/db/schema'
import { MCP_WINDOWS, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { canonicalResource, publicOrigin, type Scope } from './config'
import { sha256 } from './codes'
import { verifyAccessToken } from './tokens'
import { touchClient } from './clients'

export function resourceMetadataUrl(request: Request): string {
  return `${publicOrigin(request)}/.well-known/oauth-protected-resource/api/mcp`
}

/**
 * RFC 6750 challenge. `resource_metadata` is how a client discovers where to
 * authorize; without it Cursor cannot start the flow at all.
 */
function challenge(request: Request, extra: Record<string, string> = {}): string {
  const params: Record<string, string> = {
    resource_metadata: resourceMetadataUrl(request),
    ...extra,
  }
  const parts = Object.entries(params).map(([k, v]) => `${k}="${v}"`)
  return `Bearer ${parts.join(', ')}`
}

export function unauthorized(request: Request, description?: string): NextResponse {
  return NextResponse.json(
    { error: 'invalid_token', error_description: description ?? 'Authorization required' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': challenge(request, {
          ...(description ? { error_description: description } : {}),
        }),
      },
    },
  )
}

/**
 * 403 + `insufficient_scope` is the signal that triggers a client's step-up
 * flow. Returning a bare 403 would leave Cursor with no way to ask for more.
 */
export function insufficientScope(request: Request, needed: Scope): NextResponse {
  return NextResponse.json(
    {
      error: 'insufficient_scope',
      error_description: `This operation requires the ${needed} scope.`,
    },
    {
      status: 403,
      headers: {
        'WWW-Authenticate': challenge(request, {
          error: 'insufficient_scope',
          scope: needed,
        }),
      },
    },
  )
}

/**
 * MCP counterpart to requireUser(). Returns `{ token }` on success, or a
 * NextResponse the caller should return directly.
 */
export async function requireMcpAuth(
  request: Request,
): Promise<{ token: OAuthToken } | { response: NextResponse }> {
  const header = request.headers.get('authorization') ?? ''
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!raw) return { response: unauthorized(request) }

  // Key the limiter on a hash, so a rate-limit map never holds live tokens.
  if (!rateLimit(`mcp:${sha256(raw).slice(0, 16)}`, Date.now(), MCP_WINDOWS)) {
    return { response: tooManyRequests() }
  }

  const result = await verifyAccessToken(raw, canonicalResource(request))
  if (!result.ok) {
    const description =
      result.reason === 'expired'
        ? 'The access token has expired'
        : result.reason === 'revoked'
          ? 'The access token has been revoked'
          : result.reason === 'wrong_audience'
            ? 'The access token was not issued for this server'
            : 'The access token is invalid'
    return { response: unauthorized(request, description) }
  }

  await touchClient(result.token.clientId)
  return { token: result.token }
}
