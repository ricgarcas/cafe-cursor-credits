import { 
  LumaEvent, 
  LumaGuest, 
  LumaGuestsResponse, 
  LumaEventsResponse,
  LumaApiErrorResponse 
} from '@/types/luma'

export class LumaApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'LumaApiError'
  }
}

export class RateLimitError extends LumaApiError {
  constructor(
    public readonly retryAfter: number
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds.`, 429, 'RATE_LIMIT_EXCEEDED')
    this.name = 'RateLimitError'
  }
}

interface LumaServiceConfig {
  apiKey: string
  baseUrl?: string
  calendarId?: string
  timeout?: number
}

export class LumaService {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly calendarId?: string
  private readonly timeout: number

  constructor(config: LumaServiceConfig) {
    if (!config.apiKey) {
      throw new Error('Luma API key is required')
    }
    
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl || 'https://public-api.luma.com'
    this.calendarId = config.calendarId
    this.timeout = config.timeout || 30000
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; user?: unknown; error?: string }> {
    try {
      const response = await this.makeRequest<{ user: unknown }>('GET', '/v1/user/get-self')
      return { success: true, user: response.user }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Get all events from calendar
   */
  async listCalendarEvents(cursor?: string): Promise<LumaEventsResponse> {
    if (!this.calendarId) {
      throw new LumaApiError('LUMA_CALENDAR_ID is required', 400, 'MISSING_CALENDAR_ID')
    }

    const params: Record<string, string> = {
      calendar_api_id: this.calendarId,
    }

    if (cursor) {
      params.pagination_cursor = cursor
    }

    return this.makeRequest<LumaEventsResponse>('GET', '/v1/calendar/list-events', params)
  }

  /**
   * Get all events (handles pagination automatically)
   */
  async getAllCalendarEvents(): Promise<LumaEvent[]> {
    const allEvents: LumaEvent[] = []
    let cursor: string | undefined

    do {
      const response = await this.listCalendarEvents(cursor)
      allEvents.push(...response.entries.map(entry => entry.event))
      cursor = response.has_more ? response.next_cursor : undefined

      // Small delay between paginated requests
      if (cursor) {
        await this.delay(200)
      }
    } while (cursor)

    return allEvents
  }

  /**
   * Get event details
   */
  async getEvent(eventId: string): Promise<LumaEvent> {
    const response = await this.makeRequest<{ event: LumaEvent }>('GET', '/v1/event/get', {
      event_api_id: eventId,
    })
    return response.event
  }

  /**
   * Get guests for an event
   */
  async getEventGuests(
    eventId: string, 
    status?: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
  ): Promise<LumaGuestsResponse> {
    const params: Record<string, string> = {
      event_id: eventId,
    }

    if (status) {
      params.status = status
    }

    return this.makeRequest<LumaGuestsResponse>('GET', '/v1/event/get-guests', params)
  }

  /**
   * Get all guests for an event (handles pagination)
   */
  async getAllEventGuests(
    eventId: string, 
    status?: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
  ): Promise<LumaGuest[]> {
    const allGuests: LumaGuest[] = []
    let hasMore = true

    while (hasMore) {
      const response = await this.getEventGuests(eventId, status)
      allGuests.push(...response.guests)
      hasMore = response.pagination?.has_more ?? false

      // Small delay between paginated requests
      if (hasMore) {
        await this.delay(200)
      }
    }

    return allGuests
  }

  /**
   * Get single guest details
   */
  async getGuest(guestId: string): Promise<LumaGuest> {
    const response = await this.makeRequest<{ guest: LumaGuest }>('GET', '/v1/event/get-guest', {
      id: guestId,
    })
    return response.guest
  }

  /**
   * Update guest status
   */
  async updateGuestStatus(
    guestId: string, 
    data: { approval_status?: string; attendance_status?: string; notes?: string }
  ): Promise<unknown> {
    return this.makeRequest('POST', '/v1/event/update-guest-status', {
      guest_id: guestId,
      ...data,
    })
  }

  /**
   * Make HTTP request to Luma API
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    
    const init: RequestInit = {
      method,
      headers: {
        'x-luma-api-key': this.apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    }

    if (method === 'GET' && params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value))
      })
    } else if (method === 'POST' && params) {
      init.body = JSON.stringify(params)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)
    init.signal = controller.signal

    try {
      const response = await fetch(url.toString(), init)
      clearTimeout(timeoutId)

      // Check rate limit headers
      const remaining = response.headers.get('X-RateLimit-Remaining')
      if (remaining && parseInt(remaining) < 10) {
        console.warn(`Approaching Luma API rate limit: ${remaining} requests remaining`)
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
        throw new RateLimitError(retryAfter)
      }

      // Handle errors
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as LumaApiErrorResponse
        throw new LumaApiError(
          errorBody.error?.message || `API request failed with status ${response.status}`,
          response.status,
          errorBody.error?.code,
          { endpoint, method, params }
        )
      }

      return response.json() as Promise<T>

    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof LumaApiError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new LumaApiError('Request timeout', 408, 'TIMEOUT', { endpoint })
      }

      throw new LumaApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'UNKNOWN_ERROR',
        { endpoint, method }
      )
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Create a LumaService instance with the provided API key
 * Use this factory function to create instances with database-stored keys
 */
export function createLumaService(apiKey: string): LumaService {
  return new LumaService({ apiKey })
}

