import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/users'
import { checkAuthorizeRequest, buildRedirect } from '@/lib/oauth/authorize'
import { publicOrigin } from '@/lib/oauth/config'
import { issueAuthCode } from '@/lib/oauth/codes'
import { touchClient } from '@/lib/oauth/clients'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit'

/**
 * The approval step. Re-validates the whole authorize request rather than
 * trusting the form post — the query string arrives from the browser and a
 * user could have edited it between the consent screen and this handler.
 */
export async function POST(request: Request) {
  if (!rateLimit(`consent:${clientIp(request)}`)) return tooManyRequests()

  const url = new URL(request.url)
  const params = url.searchParams
  const form = new URLSearchParams(await request.text())
  const approved = form.get('decision') === 'approve'

  const user = await currentUser()
  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`, url),
      303,
    )
  }

  const check = await checkAuthorizeRequest(params, request)
  if (check.kind === 'fatal') {
    return NextResponse.redirect(new URL(`/oauth/authorize?${params.toString()}`, url), 303)
  }

  const issuer = publicOrigin(request)

  if (check.kind === 'redirect_error') {
    return NextResponse.redirect(
      buildRedirect(check.redirectUri, issuer, {
        error: check.error,
        error_description: check.description,
        state: check.state,
      }),
      303,
    )
  }

  if (!approved) {
    return NextResponse.redirect(
      buildRedirect(check.request.redirectUri, issuer, {
        error: 'access_denied',
        error_description: 'The user declined the request.',
        state: check.request.state,
      }),
      303,
    )
  }

  const code = await issueAuthCode({
    clientId: check.request.clientId,
    userId: user.id,
    redirectUri: check.request.redirectUri,
    scope: check.request.scope,
    resource: check.request.resource,
    codeChallenge: check.request.codeChallenge,
  })
  // Marks the client as approved at least once, which exempts it from the
  // stale-DCR prune.
  await touchClient(check.request.clientId)

  return NextResponse.redirect(
    buildRedirect(check.request.redirectUri, issuer, {
      code,
      state: check.request.state,
    }),
    303,
  )
}
