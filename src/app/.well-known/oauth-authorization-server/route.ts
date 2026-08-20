import { metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { publicOrigin, SUPPORTED_SCOPES } from '@/lib/oauth/config'

/**
 * RFC 8414 authorization server metadata.
 *
 * Hand-written because the SDK's metadata handler is Express-coupled
 * (`import { RequestHandler } from 'express'`) and will not mount in a Next
 * route handler.
 */
export async function GET(request: Request) {
  const issuer = publicOrigin(request)
  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      // S256 only. `plain` defeats the point of PKCE, so it is not offered.
      code_challenge_methods_supported: ['S256'],
      // RFC 9207 — we always return `iss`, so clients can validate it.
      authorization_response_iss_parameter_supported: true,
      resource_indicators_supported: true,
      revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      service_documentation: `${issuer}/admin/settings`,
    },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' } },
  )
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
