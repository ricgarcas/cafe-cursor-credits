import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { canonicalResource, publicOrigin, SUPPORTED_SCOPES } from '@/lib/oauth/config'

/**
 * RFC 9728. The first thing Cursor fetches after a 401 — it names which
 * authorization server to talk to. This app is its own, so the issuer is us.
 *
 * Built per-request because the public origin is only knowable from proxy
 * headers at request time.
 */
export async function GET(request: Request) {
  const handler = protectedResourceHandler({
    authServerUrls: [publicOrigin(request)],
    resourceUrl: canonicalResource(request),
  })
  const res = handler(request)
  const body = await res.json()
  return Response.json(
    { ...body, scopes_supported: [...SUPPORTED_SCOPES] },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' } },
  )
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
