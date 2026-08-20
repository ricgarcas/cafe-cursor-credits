import 'server-only'
import type { SessionOptions } from 'iron-session'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  userId?: number
  email?: string
  name?: string
  selectedEventId?: number
}

const password = process.env.SESSION_PASSWORD

/**
 * Missing cookie secret makes admin sessions forgeable, so fail loudly in
 * production. Checked at request time rather than import so `next build`
 * works without the env var.
 */
export function assertSessionSecret() {
  if (process.env.NODE_ENV === 'production' && (!password || password.length < 32)) {
    throw new Error(
      'SESSION_PASSWORD must be set to a random string of 32+ characters. Generate one with: openssl rand -hex 32',
    )
  }
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
  assertSessionSecret()
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

export async function clearSession() {
  const session = await getSession()
  session.destroy()
}
