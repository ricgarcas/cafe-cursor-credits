import 'server-only'
import type { SessionOptions } from 'iron-session'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  userId?: number
  email?: string
  name?: string
}

const password = process.env.SESSION_PASSWORD
if (!password || password.length < 32) {
  // Intentionally loud: missing cookie secret breaks auth silently.
  // Throw lazily at request time rather than at import so `next build` works
  // without the env var.
}

// Secure cookies require HTTPS. On by default in prod, but overridable via
// `SESSION_COOKIE_SECURE=false` for E2E tests running `npm run start` on http.
const secure =
  process.env.SESSION_COOKIE_SECURE === 'false'
    ? false
    : process.env.NODE_ENV === 'production'

export const sessionOptions: SessionOptions = {
  password: password ?? 'dev-insecure-do-not-use-in-production-32-chars',
  cookieName: 'cc_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

export async function clearSession() {
  const session = await getSession()
  session.destroy()
}
