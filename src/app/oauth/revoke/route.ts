import { NextResponse } from 'next/server'
import { revokeToken } from '@/lib/oauth/tokens'
import { clientIp, rateLimit, tooManyRequests, OAUTH_WINDOWS } from '@/lib/rate-limit'

/**
 * RFC 7009. The spec requires 200 even for unknown tokens, so a caller cannot
 * probe which token strings exist.
 */
export async function POST(request: Request) {
  if (!rateLimit(`revoke:${clientIp(request)}`, Date.now(), OAUTH_WINDOWS)) return tooManyRequests()
  const form = new URLSearchParams(await request.text())
  await revokeToken(form.get('token') ?? '').catch(() => false)
  return new NextResponse(null, { status: 200 })
}
