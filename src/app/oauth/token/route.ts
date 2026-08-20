import { NextResponse } from 'next/server'
import { findClient, parseGrantTypes, touchClient, verifyClientSecret } from '@/lib/oauth/clients'
import { consumeAuthCode } from '@/lib/oauth/codes'
import { canonicalResource, parseScopes, resourceMatches } from '@/lib/oauth/config'
import { issueTokens, refreshTokens } from '@/lib/oauth/tokens'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit'

const fail = (error: string, description: string, status = 400) =>
  NextResponse.json({ error, error_description: description }, { status })

/** Supports client_secret_post and client_secret_basic. */
function clientCredentials(request: Request, form: URLSearchParams) {
  const basic = request.headers.get('authorization') ?? ''
  if (basic.startsWith('Basic ')) {
    const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8')
    const idx = decoded.indexOf(':')
    if (idx > -1) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, idx)),
        clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
      }
    }
  }
  return {
    clientId: form.get('client_id') ?? '',
    clientSecret: form.get('client_secret') ?? '',
  }
}

export async function POST(request: Request) {
  if (!rateLimit(`token:${clientIp(request)}`)) return tooManyRequests()

  const form = new URLSearchParams(await request.text())
  const grantType = form.get('grant_type') ?? ''
  const { clientId, clientSecret } = clientCredentials(request, form)

  const client = await findClient(clientId)
  if (!client) return fail('invalid_client', 'Unknown or revoked client.', 401)
  if (!parseGrantTypes(client).includes(grantType)) {
    return fail('unauthorized_client', `This client may not use ${grantType}.`)
  }
  // Public clients authenticate with PKCE instead of a secret; confidential
  // ones must prove the secret before any grant is honoured.
  if (client.isConfidential && !(await verifyClientSecret(client, clientSecret))) {
    return fail('invalid_client', 'Client authentication failed.', 401)
  }

  const audience = canonicalResource(request)

  if (grantType === 'authorization_code') {
    const result = await consumeAuthCode({
      code: form.get('code') ?? '',
      clientId,
      redirectUri: form.get('redirect_uri') ?? '',
      codeVerifier: form.get('code_verifier') ?? '',
    })
    if (!result.ok) {
      return fail('invalid_grant', `Authorization code ${result.reason.replace(/_/g, ' ')}.`)
    }
    // RFC 8707: if the client names a resource, it must be the one the code
    // was issued for. Silently widening the audience is the confused deputy.
    const requested = form.get('resource')
    if (requested && !resourceMatches(requested, result.resource ?? audience)) {
      return fail('invalid_target', 'The resource does not match the authorization request.')
    }
    const tokens = await issueTokens({
      clientId,
      userId: result.userId,
      scope: result.scope,
      audience: result.resource ?? audience,
      withRefresh: true,
    })
    await touchClient(clientId)
    return NextResponse.json(
      {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: tokens.scope,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (grantType === 'refresh_token') {
    const result = await refreshTokens({
      refreshToken: form.get('refresh_token') ?? '',
      clientId,
    })
    if (!result.ok) {
      const hint =
        result.reason === 'reused'
          ? 'Refresh token was already used; the whole grant has been revoked. Re-authorize.'
          : `Refresh token ${result.reason.replace(/_/g, ' ')}.`
      return fail('invalid_grant', hint)
    }
    return NextResponse.json(
      {
        access_token: result.tokens.accessToken,
        token_type: 'Bearer',
        expires_in: result.tokens.expiresIn,
        refresh_token: result.tokens.refreshToken,
        scope: result.tokens.scope,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (grantType === 'client_credentials') {
    // The headless path: CI and cron have no browser, so they act as the app
    // rather than on behalf of a person — hence userId null.
    const requested = parseScopes(form.get('scope'))
    const allowed = parseScopes(client.scope)
    const granted = (requested.length ? requested.filter((s) => allowed.includes(s)) : allowed)
    if (granted.length === 0) {
      return fail('invalid_scope', 'None of the requested scopes are permitted for this client.')
    }
    const tokens = await issueTokens({
      clientId,
      userId: null,
      scope: granted.join(' '),
      audience,
      withRefresh: false,
    })
    await touchClient(clientId)
    return NextResponse.json(
      {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        scope: tokens.scope,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return fail('unsupported_grant_type', `Unsupported grant_type: ${grantType || '(none)'}`)
}
