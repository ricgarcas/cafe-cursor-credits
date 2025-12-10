// Luma API Response Types

export interface LumaGuest {
  id: string
  name: string
  email: string
  registration_status: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
  approval_status: 'pending' | 'approved' | 'declined' | null
  attendance_status: 'checked_in' | 'no_show' | null
  created_at: string // ISO 8601
  updated_at: string // ISO 8601
  guest_key: string // Unique key starting with 'g-'
  tickets: LumaTicket[]
  custom_fields?: Record<string, unknown>
  profile?: {
    avatar_url?: string
    bio?: string
  }
}

export interface LumaTicket {
  ticket_type_id: string
  ticket_type_name: string
  quantity: number
  price?: number
  currency?: string
}

export interface LumaEvent {
  api_id: string
  name: string
  description?: string
  start_at: string // ISO 8601
  end_at: string // ISO 8601
  timezone: string
  url: string
  cover_url?: string
  guest_count: number
  location?: {
    type: 'physical' | 'online' | 'tbd'
    name?: string
    address?: string
    place_id?: string // Google Maps Place ID
  }
  visibility: 'public' | 'private' | 'unlisted'
}

export interface LumaGuestsResponse {
  guests: LumaGuest[]
  pagination?: {
    total: number
    page: number
    per_page: number
    has_more: boolean
    next_cursor?: string
  }
}

export interface LumaEventsResponse {
  entries: Array<{ event: LumaEvent }>
  has_more: boolean
  next_cursor?: string
}

export interface LumaApiErrorResponse {
  error: {
    message: string
    code: string
    status: number
  }
}

// Zod Schemas for Runtime Validation
import { z } from 'zod'

export const lumaTicketSchema = z.object({
  ticket_type_id: z.string(),
  ticket_type_name: z.string(),
  quantity: z.number(),
  price: z.number().optional(),
  currency: z.string().optional(),
})

export const lumaGuestSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  registration_status: z.enum(['confirmed', 'waitlist', 'declined', 'cancelled']),
  approval_status: z.enum(['pending', 'approved', 'declined']).nullable(),
  attendance_status: z.enum(['checked_in', 'no_show']).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  guest_key: z.string(),
  tickets: z.array(lumaTicketSchema),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
  profile: z.object({
    avatar_url: z.string().optional(),
    bio: z.string().optional(),
  }).optional(),
})

export const lumaLocationSchema = z.object({
  type: z.enum(['physical', 'online', 'tbd']),
  name: z.string().optional(),
  address: z.string().optional(),
  place_id: z.string().optional(),
})

export const lumaEventSchema = z.object({
  api_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  start_at: z.string(),
  end_at: z.string(),
  timezone: z.string(),
  url: z.string(),
  cover_url: z.string().optional(),
  guest_count: z.number(),
  location: lumaLocationSchema.optional(),
  visibility: z.enum(['public', 'private', 'unlisted']),
})

export const lumaGuestsResponseSchema = z.object({
  guests: z.array(lumaGuestSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    per_page: z.number(),
    has_more: z.boolean(),
    next_cursor: z.string().optional(),
  }).optional(),
})

export const lumaEventsResponseSchema = z.object({
  entries: z.array(z.object({ event: lumaEventSchema })),
  has_more: z.boolean(),
  next_cursor: z.string().optional(),
})

