import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { currentUser } from '@/lib/auth/users'
import { checkAuthorizeRequest, buildRedirect } from '@/lib/oauth/authorize'
import { publicOrigin } from '@/lib/oauth/config'
import { ConsentScreen } from '@/components/oauth/consent-screen'
import { AuthorizeError } from '@/components/oauth/authorize-error'

export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

function toParams(search: Search): URLSearchParams {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(search)) {
    if (typeof v === 'string') params.set(k, v)
    else if (Array.isArray(v) && v[0]) params.set(k, v[0])
  }
  return params
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const search = await searchParams
  const params = toParams(search)

  // Reconstruct the inbound Request so origin detection sees the same proxy
  // headers the route handlers do.
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost'
  const request = new Request(`${proto}://${host}/oauth/authorize?${params.toString()}`, {
    headers: h,
  })

  const check = await checkAuthorizeRequest(params, request)

  if (check.kind === 'fatal') {
    return <AuthorizeError message={check.message} />
  }
  if (check.kind === 'redirect_error') {
    redirect(
      buildRedirect(check.redirectUri, publicOrigin(request), {
        error: check.error,
        error_description: check.description,
        state: check.state,
      }),
    )
  }

  // Not signed in? Send them through the existing admin login, then straight
  // back here with the request intact.
  const user = await currentUser()
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`)
  }

  return (
    <ConsentScreen
      clientName={check.client.name}
      isNewClient={!check.client.lastUsedAt}
      scope={check.request.scope}
      resource={check.request.resource}
      userEmail={user!.email}
      params={params.toString()}
    />
  )
}
