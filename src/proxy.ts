import { NextResponse, type NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/auth/session'
import { countUsers } from '@/lib/auth/users'

/**
 * Bootstrap + auth gate.
 *
 * 1. First-open: if no admin exists, every non-API route funnels to
 *    /admin-register (even /login, /register, /claim). Cloners don't need to
 *    memorize the bootstrap URL — any entry point self-redirects.
 * 2. Auth gate: /admin/* (excluding /admin-register) and /onboarding require
 *    a valid session; otherwise bounce to /login with a redirect param.
 *
 * Proxy always runs on the Node.js runtime, so SQLite queries are fine here.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const isApi = pathname.startsWith('/api')
  const isBootstrapPage = pathname === '/admin-register'

  // Bootstrap funnel: no admin yet → everything goes to /admin-register.
  if (!isApi && !isBootstrapPage) {
    try {
      const hasAdmin = (await countUsers()) > 0
      if (!hasAdmin) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin-register'
        url.search = ''
        return NextResponse.redirect(url)
      }
    } catch {
      // DB unreachable — let the request through rather than lock the app out.
    }
  }

  // Auth gate. /admin-register stays public since it IS the bootstrap.
  const protectedPath =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/onboarding')
  if (!protectedPath) return NextResponse.next()

  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(request, res, sessionOptions)
  if (!session.userId) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname + (search || ''))
    return NextResponse.redirect(url)
  }
  return res
}
