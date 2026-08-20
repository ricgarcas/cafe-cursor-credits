import 'server-only'
import { findClient, redirectUriAllowed } from './clients'
import { canonicalResource, parseScopes, resourceMatches, SUPPORTED_SCOPES } from './config'
import type { OAuthClient } from '@/lib/db/schema'

export type AuthorizeRequest = {
  clientId: string
  redirectUri: string
  state: string | null
  scope: string
  resource: string
  codeChallenge: string
}

export type AuthorizeCheck =
  /** Fatal: we cannot trust the redirect target, so we MUST render, not redirect. */
  | { kind: 'fatal'; message: string }
  /** Recoverable: bounce the error back to the client per OAuth 2.1. */
  | { kind: 'redirect_error'; redirectUri: string; state: string | null; error: string; description: string }
  | { kind: 'ok'; client: OAuthClient; request: AuthorizeRequest }

/**
 * Validates an /oauth/authorize request.
 *
 * The split between `fatal` and `redirect_error` matters: if client_id or
 * redirect_uri is wrong we have no verified place to send the user, and
 * redirecting anyway would turn this endpoint into an open redirector.
 */
export async function checkAuthorizeRequest(
  params: URLSearchParams,
  request: Request,
): Promise<AuthorizeCheck> {
  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''

  const client = await findClient(clientId)
  if (!client) {
    return { kind: 'fatal', message: 'Unknown or revoked client. Try connecting from Cursor again.' }
  }
  if (!redirectUri || !redirectUriAllowed(client, redirectUri)) {
    return {
      kind: 'fatal',
      message: 'The redirect URI is not registered for this client.',
    }
  }

  const state = params.get('state')
  const err = (error: string, description: string): AuthorizeCheck => ({
    kind: 'redirect_error',
    redirectUri,
    state,
    error,
    description,
  })

  if ((params.get('response_type') ?? '') !== 'code') {
    return err('unsupported_response_type', 'Only the authorization code flow is supported.')
  }

  const codeChallenge = params.get('code_challenge') ?? ''
  const method = params.get('code_challenge_method') ?? ''
  if (!codeChallenge) {
    return err('invalid_request', 'PKCE is required: code_challenge is missing.')
  }
  if (method !== 'S256') {
    return err('invalid_request', 'code_challenge_method must be S256.')
  }

  const requested = parseScopes(params.get('scope'))
  const allowed = parseScopes(client.scope)
  const granted = requested.length
    ? requested.filter((s) => allowed.includes(s))
    : allowed.length
      ? allowed
      : [...SUPPORTED_SCOPES]
  if (granted.length === 0) {
    return err('invalid_scope', 'None of the requested scopes are available.')
  }

  // RFC 8707. Cursor sends this; defaulting keeps hand-rolled clients working,
  // but a resource naming a different server is refused outright.
  const canonical = canonicalResource(request)
  const resourceParam = params.get('resource')
  if (resourceParam && !resourceMatches(resourceParam, canonical)) {
    return err('invalid_target', `This server only issues tokens for ${canonical}.`)
  }

  return {
    kind: 'ok',
    client,
    request: {
      clientId,
      redirectUri,
      state,
      scope: granted.join(' '),
      resource: canonical,
      codeChallenge,
    },
  }
}

/** RFC 9207: `iss` goes on every authorization response, errors included. */
export function buildRedirect(
  redirectUri: string,
  issuer: string,
  fields: Record<string, string | null>,
): string {
  const url = new URL(redirectUri)
  url.searchParams.set('iss', issuer)
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v)
  }
  return url.toString()
}
