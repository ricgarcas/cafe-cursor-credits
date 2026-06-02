import 'server-only'

/**
 * Minimal Luma public API client. Docs: https://docs.lu.ma/reference/
 * Auth: `x-luma-api-key` header. Cursor-based pagination.
 * Rate limit: ~300 req/min — we space paged requests with a small delay.
 */
const BASE_URL = 'https://public-api.luma.com'

type FetchOptions = {
  apiKey: string
  path: string
  query?: Record<string, string | undefined>
  method?: 'GET' | 'POST'
  body?: unknown
}

async function lumaFetch<T>(opts: FetchOptions): Promise<T> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v != null && v !== '') params.set(k, v)
  }
  const url = `${BASE_URL}${opts.path}${params.toString() ? `?${params}` : ''}`

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      'x-luma-api-key': opts.apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`Luma ${res.status}: ${text.slice(0, 300) || res.statusText}`) as Error & {
      status: number
    }
    err.status = res.status
    throw err
  }
  return (await res.json()) as T
}

export type LumaGetSelfResponse = {
  user?: { api_id: string; name?: string; email?: string }
  api_id?: string
}

export async function getSelf(apiKey: string): Promise<LumaGetSelfResponse> {
  return lumaFetch<LumaGetSelfResponse>({ apiKey, path: '/v1/user/get-self' })
}

export type LumaEventSummary = {
  api_id: string
  name: string
  start_at?: string | null
  end_at?: string | null
  timezone?: string | null
  url?: string | null
  cover_url?: string | null
  guest_count?: number
  visibility?: string
  geo_address_info?: { full_address?: string } | null
  location?: {
    type?: string | null
    place?: { name?: string | null; address?: string | null } | null
  } | null
}

type ListEventsResponse = {
  entries?: Array<{ event?: LumaEventSummary; api_id?: string }>
  has_more?: boolean
  next_cursor?: string | null
}

/**
 * Lists events accessible to the key. Paginates internally and returns all.
 * Calendar-scoped keys don't strictly need `calendar_api_id`, but we pass it
 * when the admin has saved one — belt-and-suspenders in case the key is
 * user-scoped or Luma tightens the requirement.
 */
export async function listAllEvents(
  apiKey: string,
  calendarApiId?: string,
): Promise<LumaEventSummary[]> {
  const events: LumaEventSummary[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const res = await lumaFetch<ListEventsResponse>({
      apiKey,
      path: '/v1/calendar/list-events',
      query: {
        pagination_cursor: cursor,
        calendar_api_id: calendarApiId,
      },
    })
    for (const entry of res.entries ?? []) {
      if (entry.event) events.push(entry.event)
    }
    if (!res.has_more || !res.next_cursor) break
    cursor = res.next_cursor
    // Light throttle to stay under rate limits.
    await new Promise((r) => setTimeout(r, 200))
  }
  return events
}

export type LumaGuest = {
  api_id: string
  name: string
  email: string
  registration_status: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
  approval_status?: string | null
  attendance_status?: string | null
  created_at?: string | null
  updated_at?: string | null
  guest_key?: string | null
}

type GetGuestsResponse = {
  entries?: Array<{ guest?: LumaGuest }>
  has_more?: boolean
  next_cursor?: string | null
}

export async function listAllGuests(
  apiKey: string,
  eventApiId: string,
): Promise<LumaGuest[]> {
  const out: LumaGuest[] = []
  let cursor: string | undefined
  for (let page = 0; page < 100; page++) {
    const res = await lumaFetch<GetGuestsResponse>({
      apiKey,
      path: '/v1/event/get-guests',
      query: {
        event_api_id: eventApiId,
        pagination_cursor: cursor,
      },
    })
    for (const e of res.entries ?? []) {
      if (e.guest) out.push(e.guest)
    }
    if (!res.has_more || !res.next_cursor) break
    cursor = res.next_cursor
    await new Promise((r) => setTimeout(r, 200))
  }
  return out
}
