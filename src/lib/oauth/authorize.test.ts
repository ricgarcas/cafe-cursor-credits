import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { oauthClients } from '@/lib/db/schema'
import { registerPublicClient } from './clients'
import { checkAuthorizeRequest, buildRedirect } from './authorize'
import { s256Challenge } from './codes'
import { SCOPE_READ, SCOPE_WRITE } from './config'

const ORIGIN = 'https://cc.example.com'
const REDIRECT = 'http://127.0.0.1:51000/callback'
const req = () => new Request(`${ORIGIN}/oauth/authorize`)

let clientId: string

beforeEach(async () => {
  await db.delete(oauthClients)
  const client = await registerPublicClient({ name: 'Cursor', redirectUris: [REDIRECT] })
  clientId = client.clientId
})

function params(over: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: s256Challenge('v'.repeat(64)),
    code_challenge_method: 'S256',
    scope: `${SCOPE_READ} ${SCOPE_WRITE}`,
    resource: `${ORIGIN}/api/mcp`,
    state: 'xyz',
    ...over,
  })
}

describe('authorize validation', () => {
  it('accepts a well-formed request', async () => {
    const result = await checkAuthorizeRequest(params(), req())
    expect(result.kind).toBe('ok')
  })

  it('renders rather than redirects for an unknown client', async () => {
    const result = await checkAuthorizeRequest(params({ client_id: 'nope' }), req())
    expect(result.kind).toBe('fatal')
  })

  it('renders rather than redirects for an unregistered redirect URI', async () => {
    // Redirecting here would make the endpoint an open redirector.
    const result = await checkAuthorizeRequest(
      params({ redirect_uri: 'https://evil.example.com/cb' }),
      req(),
    )
    expect(result.kind).toBe('fatal')
  })

  it('rejects a missing PKCE challenge', async () => {
    const p = params()
    p.delete('code_challenge')
    const result = await checkAuthorizeRequest(p, req())
    expect(result).toMatchObject({ kind: 'redirect_error', error: 'invalid_request' })
  })

  it('rejects the plain PKCE method', async () => {
    const result = await checkAuthorizeRequest(
      params({ code_challenge_method: 'plain' }),
      req(),
    )
    expect(result).toMatchObject({ kind: 'redirect_error', error: 'invalid_request' })
  })

  it('rejects a resource naming a different server', async () => {
    const result = await checkAuthorizeRequest(
      params({ resource: 'https://evil.example.com/api/mcp' }),
      req(),
    )
    expect(result).toMatchObject({ kind: 'redirect_error', error: 'invalid_target' })
  })

  it('narrows requested scopes to what the client may have', async () => {
    await db.update(oauthClients).set({ scope: SCOPE_READ })
    const result = await checkAuthorizeRequest(params(), req())
    expect(result).toMatchObject({ kind: 'ok', request: { scope: SCOPE_READ } })
  })

  it('rejects a response_type other than code', async () => {
    const result = await checkAuthorizeRequest(params({ response_type: 'token' }), req())
    expect(result).toMatchObject({ kind: 'redirect_error', error: 'unsupported_response_type' })
  })
})

describe('redirect building', () => {
  it('always carries iss, per RFC 9207', () => {
    const url = buildRedirect(REDIRECT, ORIGIN, { code: 'abc', state: 'xyz' })
    expect(new URL(url).searchParams.get('iss')).toBe(ORIGIN)
  })

  it('carries iss on error responses too', () => {
    const url = buildRedirect(REDIRECT, ORIGIN, { error: 'access_denied', state: null })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('iss')).toBe(ORIGIN)
    expect(parsed.searchParams.has('state')).toBe(false)
  })
})
