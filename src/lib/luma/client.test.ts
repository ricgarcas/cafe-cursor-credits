import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getSelf, listAllEvents, listAllGuests } from './client'

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getSelf', () => {
  it('hits the get-self endpoint with the api key header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { api_id: 'usr-1' } }))
    const res = await getSelf('sk-test')

    expect(res.user?.api_id).toBe('usr-1')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://public-api.luma.com/v1/user/get-self')
    expect(opts.headers['x-luma-api-key']).toBe('sk-test')
  })

  it('throws with a status on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, { ok: false, status: 401 }))
    await expect(getSelf('bad')).rejects.toMatchObject({ status: 401 })
  })
})

describe('listAllEvents', () => {
  it('paginates and flattens entries, skipping rows without an event', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [{ event: { api_id: 'evt-1', name: 'One' } }, { api_id: 'no-event' }],
          has_more: true,
          next_cursor: 'c2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [{ event: { api_id: 'evt-2', name: 'Two' } }],
          has_more: false,
          next_cursor: null,
        }),
      )

    const { events, truncated } = await listAllEvents('sk-test')
    expect(events.map((e) => e.api_id)).toEqual(['evt-1', 'evt-2'])
    expect(truncated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Second call forwards the cursor returned by the first.
    expect(fetchMock.mock.calls[1][0]).toContain('pagination_cursor=c2')
  })

  it('flags truncation when the page cap is hit with more pages waiting', async () => {
    // Every page reports has_more — listAllEvents caps at 20 pages.
    fetchMock.mockResolvedValue(
      jsonResponse({
        entries: [{ event: { api_id: 'evt-x', name: 'X' } }],
        has_more: true,
        next_cursor: 'next',
      }),
    )

    const { truncated } = await listAllEvents('sk-test')
    expect(truncated).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(20)
  })

  it('omits empty query params and includes calendar id when given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [], has_more: false }))
    await listAllEvents('sk-test', 'cal-123')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('calendar_api_id=cal-123')
    expect(url).not.toContain('pagination_cursor=') // undefined cursor dropped
  })

  it('reports not-truncated on a single complete page', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entries: [], has_more: false }))
    const { truncated } = await listAllEvents('sk-test')
    expect(truncated).toBe(false)
  })
})

describe('listAllGuests', () => {
  it('collects guests across pages and drops empty entries', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            { guest: { api_id: 'g1', name: 'A', email: 'a@x.com', registration_status: 'confirmed' } },
            {},
          ],
          has_more: true,
          next_cursor: 'p2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            { guest: { api_id: 'g2', name: 'B', email: 'b@x.com', registration_status: 'waitlist' } },
          ],
          has_more: false,
        }),
      )

    const { guests, truncated } = await listAllGuests('sk-test', 'evt-1')
    expect(guests.map((g) => g.api_id)).toEqual(['g1', 'g2'])
    expect(truncated).toBe(false)
    expect(fetchMock.mock.calls[0][0]).toContain('event_api_id=evt-1')
  })
})
