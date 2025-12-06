# Luma API Integration - Technical Specification

**Document Version:** 1.0  
**Date:** December 6, 2024  
**Project:** Cafe Cursor Toronto - Luma Event Sync Integration  
**API Documentation:** https://docs.luma.com/reference/getting-started-with-your-api

---

## Table of Contents

1. [Overview](#overview)
2. [API Configuration](#api-configuration)
3. [Authentication](#authentication)
4. [Core Endpoints](#core-endpoints)
5. [TypeScript Data Models](#typescript-data-models)
6. [Database Schema](#database-schema)
7. [Integration Architecture](#integration-architecture)
8. [Implementation Guide](#implementation-guide)
9. [Rate Limits & Performance](#rate-limits--performance)
10. [Error Handling](#error-handling)
11. [Security Considerations](#security-considerations)
12. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

### Purpose

This document outlines the technical requirements and integration points for connecting the existing Cafe Cursor Toronto credits/coupon application with Luma's event management platform. The primary goal is to:

1. Sync events from Luma to the local database
2. Fetch event attendee/guest information automatically
3. Assign coupon codes to registered Luma guests
4. Send coupon notification emails to attendees

### Luma Platform Summary

| Attribute | Value |
|-----------|-------|
| Platform | Event management and ticketing system |
| API Type | RESTful JSON API |
| Base URL | `https://public-api.luma.com` |
| API Version | v1 |
| Subscription Required | Luma Plus |

### Key Capabilities

- Retrieve event guest lists with registration details
- Access attendee information (name, email, status, tickets)
- Manage guest registration statuses
- Native coupon/discount code management (optional use)
- Real-time event data synchronization

### Tech Stack Alignment

This integration is designed for the existing stack:

- **Framework:** Next.js 15 (App Router) with TypeScript
- **Database:** Supabase (PostgreSQL)
- **Email:** Resend
- **UI Components:** shadcn/ui with Tailwind CSS v4
- **Validation:** Zod

---

## API Configuration

### Prerequisites

1. **Luma Plus Subscription** (required for API access)
2. **API Key** generated from Luma dashboard
3. **Calendar ID** for the events you want to access

### Environment Variables

Add the following to your `.env.local` file:

```env
# Luma API Configuration
LUMA_API_KEY=your_luma_api_key_here
LUMA_API_BASE_URL=https://public-api.luma.com
LUMA_CALENDAR_ID=your_calendar_id
```

### Updated `env.example`

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Resend Email Configuration
RESEND_API_KEY=re_your_resend_api_key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Luma API Configuration
LUMA_API_KEY=your_luma_api_key_here
LUMA_API_BASE_URL=https://public-api.luma.com
LUMA_CALENDAR_ID=your_calendar_id
```

---

## Authentication

### Authentication Method

| Attribute | Value |
|-----------|-------|
| Type | API Key Authentication |
| Header | `x-luma-api-key` |
| Security | Full account access - store securely |

### Example Request (cURL)

```bash
curl -H "x-luma-api-key: $LUMA_API_KEY" \
  https://public-api.luma.com/v1/user/get-self
```

### TypeScript Fetch Example

```typescript
const response = await fetch('https://public-api.luma.com/v1/user/get-self', {
  headers: {
    'x-luma-api-key': process.env.LUMA_API_KEY!,
    'Accept': 'application/json',
  },
});
```

---

## Core Endpoints

### 1. Get Event Guests (Primary Endpoint)

**Endpoint:** `GET /v1/event/get-guests`

**Purpose:** Retrieve all guests/attendees for a specific event. This is the main endpoint for fetching attendee information to assign coupons.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `event_id` | Yes | The event identifier |
| `status` | No | Filter by: `confirmed`, `waitlist`, `declined`, `cancelled` |

**Expected Response:**

```json
{
  "guests": [
    {
      "id": "guest_abc123",
      "name": "John Doe",
      "email": "john@example.com",
      "registration_status": "confirmed",
      "created_at": "2024-12-01T10:00:00Z",
      "updated_at": "2024-12-01T10:00:00Z",
      "tickets": [
        {
          "ticket_type_id": "ticket_xyz",
          "ticket_type_name": "General Admission",
          "quantity": 1
        }
      ],
      "approval_status": "approved",
      "attendance_status": null,
      "guest_key": "g-abc123xyz"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "per_page": 50,
    "has_more": true
  }
}
```

---

### 2. Get Single Guest

**Endpoint:** `GET /v1/event/get-guest`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Guest ID or guest key (starts with `g-`) |

**Response:**

```json
{
  "id": "guest_abc123",
  "name": "John Doe",
  "email": "john@example.com",
  "registration_status": "confirmed",
  "tickets": [...],
  "custom_fields": {
    "company": "ACME Corp",
    "dietary_restrictions": "Vegetarian"
  }
}
```

---

### 3. List Calendar Events

**Endpoint:** `GET /v1/calendar/list-events`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `calendar_api_id` | Yes | Your calendar ID |
| `series_mode` | No | How to handle recurring events |
| `pagination_cursor` | No | For pagination |

**Response:**

```json
{
  "entries": [
    {
      "event": {
        "api_id": "evt-abc123",
        "name": "Tech Meetup December 2024",
        "start_at": "2024-12-15T18:00:00Z",
        "end_at": "2024-12-15T21:00:00Z",
        "timezone": "America/Mexico_City",
        "guest_count": 45,
        "url": "https://lu.ma/tech-meetup-dec"
      }
    }
  ],
  "has_more": false
}
```

---

### 4. Get Event Details

**Endpoint:** `GET /v1/event/get`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `event_api_id` | Yes | Event identifier |

**Response Includes:**
- Event metadata (name, description, dates)
- Venue/location information
- Ticket types and pricing
- Registration settings
- Guest count statistics

---

### 5. Update Guest Status

**Endpoint:** `POST /v1/event/update-guest-status`

**Request Body:**

```json
{
  "guest_id": "guest_abc123",
  "approval_status": "approved",
  "attendance_status": "checked_in"
}
```

---

## TypeScript Data Models

### Location: `src/types/luma.ts`

```typescript
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

export interface LumaApiError {
  error: {
    message: string
    code: string
    status: number
  }
}

// Zod Schemas for Runtime Validation
import { z } from 'zod'

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
  tickets: z.array(z.object({
    ticket_type_id: z.string(),
    ticket_type_name: z.string(),
    quantity: z.number(),
    price: z.number().optional(),
    currency: z.string().optional(),
  })),
  custom_fields: z.record(z.unknown()).optional(),
  profile: z.object({
    avatar_url: z.string().optional(),
    bio: z.string().optional(),
  }).optional(),
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
  location: z.object({
    type: z.enum(['physical', 'online', 'tbd']),
    name: z.string().optional(),
    address: z.string().optional(),
    place_id: z.string().optional(),
  }).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']),
})
```

### Extended Database Types: `src/types/database.ts`

Add the following to the existing `database.ts` file:

```typescript
// Add to existing Database interface
export interface Database {
  public: {
    Tables: {
      // ... existing tables ...
      
      luma_events: {
        Row: {
          id: number
          luma_event_id: string
          name: string
          description: string | null
          start_at: string
          end_at: string
          timezone: string
          url: string | null
          cover_url: string | null
          guest_count: number
          location_type: 'physical' | 'online' | 'tbd' | null
          location_name: string | null
          location_address: string | null
          visibility: 'public' | 'private' | 'unlisted'
          is_sync_enabled: boolean
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          luma_event_id: string
          name: string
          description?: string | null
          start_at: string
          end_at: string
          timezone: string
          url?: string | null
          cover_url?: string | null
          guest_count?: number
          location_type?: 'physical' | 'online' | 'tbd' | null
          location_name?: string | null
          location_address?: string | null
          visibility?: 'public' | 'private' | 'unlisted'
          is_sync_enabled?: boolean
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          luma_event_id?: string
          name?: string
          description?: string | null
          start_at?: string
          end_at?: string
          timezone?: string
          url?: string | null
          cover_url?: string | null
          guest_count?: number
          location_type?: 'physical' | 'online' | 'tbd' | null
          location_name?: string | null
          location_address?: string | null
          visibility?: 'public' | 'private' | 'unlisted'
          is_sync_enabled?: boolean
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      
      luma_guests: {
        Row: {
          id: number
          luma_guest_id: string
          luma_event_id: string
          guest_key: string
          name: string
          email: string
          registration_status: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
          approval_status: string | null
          attendance_status: string | null
          registered_at: string | null
          synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          luma_guest_id: string
          luma_event_id: string
          guest_key: string
          name: string
          email: string
          registration_status: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
          approval_status?: string | null
          attendance_status?: string | null
          registered_at?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          luma_guest_id?: string
          luma_event_id?: string
          guest_key?: string
          name?: string
          email?: string
          registration_status?: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
          approval_status?: string | null
          attendance_status?: string | null
          registered_at?: string | null
          synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "luma_guests_luma_event_id_fkey"
            columns: ["luma_event_id"]
            isOneToOne: false
            referencedRelation: "luma_events"
            referencedColumns: ["luma_event_id"]
          }
        ]
      }
    }
  }
}

// Convenience types for Luma tables
export type LumaEventRow = Database['public']['Tables']['luma_events']['Row']
export type LumaEventInsert = Database['public']['Tables']['luma_events']['Insert']
export type LumaEventUpdate = Database['public']['Tables']['luma_events']['Update']

export type LumaGuestRow = Database['public']['Tables']['luma_guests']['Row']
export type LumaGuestInsert = Database['public']['Tables']['luma_guests']['Insert']
export type LumaGuestUpdate = Database['public']['Tables']['luma_guests']['Update']

// Extended types with relationships
export type LumaGuestWithEvent = LumaGuestRow & {
  luma_events: LumaEventRow | null
}

export type LumaGuestWithCoupon = LumaGuestRow & {
  attendees: (Attendee & { coupon_codes: CouponCode | null }) | null
}
```

---

## Database Schema

### Location: `supabase-schema-luma.sql`

Run this in your Supabase SQL Editor to add Luma integration tables:

```sql
-- ============================================
-- Luma Integration Schema
-- Run this after the base schema
-- ============================================

-- Create luma_events table
CREATE TABLE IF NOT EXISTS public.luma_events (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  luma_event_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  url TEXT,
  cover_url TEXT,
  guest_count INT DEFAULT 0,
  location_type TEXT CHECK (location_type IN ('physical', 'online', 'tbd')),
  location_name TEXT,
  location_address TEXT,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'unlisted')),
  is_sync_enabled BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create luma_guests table
CREATE TABLE IF NOT EXISTS public.luma_guests (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  luma_guest_id TEXT UNIQUE NOT NULL,
  luma_event_id TEXT NOT NULL REFERENCES public.luma_events(luma_event_id) ON DELETE CASCADE,
  guest_key TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  registration_status TEXT NOT NULL CHECK (registration_status IN ('confirmed', 'waitlist', 'declined', 'cancelled')),
  approval_status TEXT,
  attendance_status TEXT,
  registered_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Luma reference columns to attendees table
ALTER TABLE public.attendees 
  ADD COLUMN IF NOT EXISTS luma_guest_id TEXT REFERENCES public.luma_guests(luma_guest_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS luma_event_id TEXT REFERENCES public.luma_events(luma_event_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'luma', 'website'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_luma_events_luma_event_id ON public.luma_events(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_events_start_at ON public.luma_events(start_at);
CREATE INDEX IF NOT EXISTS idx_luma_events_is_sync_enabled ON public.luma_events(is_sync_enabled);

CREATE INDEX IF NOT EXISTS idx_luma_guests_luma_guest_id ON public.luma_guests(luma_guest_id);
CREATE INDEX IF NOT EXISTS idx_luma_guests_luma_event_id ON public.luma_guests(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_guests_email ON public.luma_guests(email);
CREATE INDEX IF NOT EXISTS idx_luma_guests_registration_status ON public.luma_guests(registration_status);

CREATE INDEX IF NOT EXISTS idx_attendees_luma_guest_id ON public.attendees(luma_guest_id);
CREATE INDEX IF NOT EXISTS idx_attendees_luma_event_id ON public.attendees(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_attendees_source ON public.attendees(source);

-- Enable Row Level Security
ALTER TABLE public.luma_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luma_guests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for luma_events
CREATE POLICY "Allow authenticated users to view luma_events"
  ON public.luma_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to luma_events"
  ON public.luma_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- RLS Policies for luma_guests
CREATE POLICY "Allow authenticated users to view luma_guests"
  ON public.luma_guests
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to luma_guests"
  ON public.luma_guests
  FOR ALL
  USING (auth.role() = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER set_luma_events_updated_at
  BEFORE UPDATE ON public.luma_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_luma_guests_updated_at
  BEFORE UPDATE ON public.luma_guests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Luma Sync Log Table (for debugging/monitoring)
-- ============================================

CREATE TABLE IF NOT EXISTS public.luma_sync_logs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  luma_event_id TEXT REFERENCES public.luma_events(luma_event_id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('manual', 'scheduled', 'webhook')),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  guests_synced INT DEFAULT 0,
  guests_added INT DEFAULT 0,
  guests_updated INT DEFAULT 0,
  coupons_assigned INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luma_sync_logs_event_id ON public.luma_sync_logs(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_sync_logs_status ON public.luma_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_luma_sync_logs_created_at ON public.luma_sync_logs(created_at);

ALTER TABLE public.luma_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view luma_sync_logs"
  ON public.luma_sync_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to luma_sync_logs"
  ON public.luma_sync_logs
  FOR ALL
  USING (auth.role() = 'service_role');
```

---

## Integration Architecture

### Architecture Diagram

```
┌─────────────────────┐
│     Luma API        │
│    (External)       │
└──────────┬──────────┘
           │ HTTPS/JSON
           │
┌──────────▼───────────────────────────────────────────┐
│              Next.js Application                      │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │    LumaService (src/lib/luma/service.ts)        │ │
│  │    - API communication                          │ │
│  │    - Response transformation                    │ │
│  │    - Error handling & rate limiting             │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                               │
│  ┌────────────────────▼────────────────────────────┐ │
│  │    API Routes (src/app/api/admin/luma/*)        │ │
│  │    - /sync-events - Fetch all events            │ │
│  │    - /sync-guests - Sync guests for event       │ │
│  │    - /test-connection - Verify API key          │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                               │
│  ┌────────────────────▼────────────────────────────┐ │
│  │    Coupon Assignment Logic                      │ │
│  │    - Generate coupon codes                      │ │
│  │    - Link to Luma guests                        │ │
│  │    - Send email notifications via Resend        │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                               │
│  ┌────────────────────▼────────────────────────────┐ │
│  │    Supabase (PostgreSQL)                        │ │
│  │    - luma_events                                │ │
│  │    - luma_guests                                │ │
│  │    - attendees (with luma references)           │ │
│  │    - coupon_codes                               │ │
│  │    - luma_sync_logs                             │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── lib/
│   └── luma/
│       ├── service.ts          # Luma API client service
│       ├── types.ts            # Re-export types for convenience
│       └── sync.ts             # Sync logic and coupon assignment
├── app/
│   └── api/
│       └── admin/
│           └── luma/
│               ├── test-connection/
│               │   └── route.ts
│               ├── sync-events/
│               │   └── route.ts
│               ├── sync-guests/
│               │   └── route.ts
│               └── events/
│                   └── route.ts
├── components/
│   └── admin/
│       ├── luma-events-list.tsx
│       ├── luma-sync-button.tsx
│       └── luma-connection-status.tsx
└── types/
    ├── database.ts             # Extended with Luma types
    └── luma.ts                 # Luma API types
```

---

## Implementation Guide

### 1. Luma Service Class

**Location:** `src/lib/luma/service.ts`

```typescript
import { 
  LumaEvent, 
  LumaGuest, 
  LumaGuestsResponse, 
  LumaEventsResponse,
  LumaApiError 
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
  baseUrl: string
  calendarId?: string
  timeout?: number
}

export class LumaService {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly calendarId?: string
  private readonly timeout: number

  constructor(config?: Partial<LumaServiceConfig>) {
    this.baseUrl = config?.baseUrl || process.env.LUMA_API_BASE_URL || 'https://public-api.luma.com'
    this.apiKey = config?.apiKey || process.env.LUMA_API_KEY || ''
    this.calendarId = config?.calendarId || process.env.LUMA_CALENDAR_ID
    this.timeout = config?.timeout || 30000

    if (!this.apiKey) {
      throw new Error('LUMA_API_KEY is required')
    }
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
    let page = 1

    while (hasMore) {
      const response = await this.getEventGuests(eventId, status)
      allGuests.push(...response.guests)
      hasMore = response.pagination?.has_more ?? false
      page++

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
        const errorBody = await response.json().catch(() => ({})) as LumaApiError
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

// Singleton instance for convenience
let lumaServiceInstance: LumaService | null = null

export function getLumaService(): LumaService {
  if (!lumaServiceInstance) {
    lumaServiceInstance = new LumaService()
  }
  return lumaServiceInstance
}
```

---

### 2. Sync Logic

**Location:** `src/lib/luma/sync.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/server'
import { getLumaService, LumaService } from './service'
import { sendCouponEmail } from '@/lib/emails/send-coupon-email'
import { LumaEvent, LumaGuest } from '@/types/luma'

interface SyncResult {
  success: boolean
  guestsSynced: number
  guestsAdded: number
  guestsUpdated: number
  couponsAssigned: number
  errors: string[]
}

interface SyncOptions {
  assignCoupons?: boolean
  sendEmails?: boolean
  status?: 'confirmed' | 'waitlist' | 'declined' | 'cancelled'
}

/**
 * Sync events from Luma calendar to local database
 */
export async function syncLumaEvents(): Promise<{
  success: boolean
  eventsSynced: number
  errors: string[]
}> {
  const luma = getLumaService()
  const supabase = await createAdminClient()
  const errors: string[] = []
  let eventsSynced = 0

  try {
    const events = await luma.getAllCalendarEvents()

    for (const event of events) {
      try {
        await upsertLumaEvent(supabase, event)
        eventsSynced++
      } catch (error) {
        errors.push(`Failed to sync event ${event.api_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return { success: errors.length === 0, eventsSynced, errors }
  } catch (error) {
    return {
      success: false,
      eventsSynced: 0,
      errors: [error instanceof Error ? error.message : 'Failed to fetch events'],
    }
  }
}

/**
 * Sync guests for a specific event
 */
export async function syncLumaGuests(
  eventId: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { assignCoupons = true, sendEmails = true, status = 'confirmed' } = options
  
  const luma = getLumaService()
  const supabase = await createAdminClient()
  
  const result: SyncResult = {
    success: true,
    guestsSynced: 0,
    guestsAdded: 0,
    guestsUpdated: 0,
    couponsAssigned: 0,
    errors: [],
  }

  // Create sync log entry
  const { data: syncLog } = await supabase
    .from('luma_sync_logs')
    .insert({
      luma_event_id: eventId,
      sync_type: 'manual',
      status: 'started',
    })
    .select()
    .single()

  try {
    // Ensure event exists locally
    const event = await luma.getEvent(eventId)
    await upsertLumaEvent(supabase, event)

    // Fetch guests from Luma
    const guests = await luma.getAllEventGuests(eventId, status)
    result.guestsSynced = guests.length

    // Process guests in batches to avoid overwhelming the database
    const batchSize = 50
    for (let i = 0; i < guests.length; i += batchSize) {
      const batch = guests.slice(i, i + batchSize)
      
      for (const guest of batch) {
        try {
          const isNew = await upsertLumaGuest(supabase, eventId, guest)
          
          if (isNew) {
            result.guestsAdded++
          } else {
            result.guestsUpdated++
          }

          // Assign coupon if enabled and guest is confirmed
          if (assignCoupons && guest.registration_status === 'confirmed') {
            const couponAssigned = await assignCouponToGuest(supabase, guest, eventId, sendEmails)
            if (couponAssigned) {
              result.couponsAssigned++
            }
          }
        } catch (error) {
          result.errors.push(
            `Failed to process guest ${guest.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }

      // Small delay between batches
      if (i + batchSize < guests.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // Update event's last_synced_at
    await supabase
      .from('luma_events')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('luma_event_id', eventId)

    result.success = result.errors.length === 0

  } catch (error) {
    result.success = false
    result.errors.push(error instanceof Error ? error.message : 'Sync failed')
  }

  // Update sync log
  if (syncLog) {
    await supabase
      .from('luma_sync_logs')
      .update({
        status: result.success ? 'completed' : 'failed',
        guests_synced: result.guestsSynced,
        guests_added: result.guestsAdded,
        guests_updated: result.guestsUpdated,
        coupons_assigned: result.couponsAssigned,
        error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id)
  }

  return result
}

/**
 * Upsert a Luma event to the database
 */
async function upsertLumaEvent(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  event: LumaEvent
): Promise<void> {
  const { error } = await supabase
    .from('luma_events')
    .upsert({
      luma_event_id: event.api_id,
      name: event.name,
      description: event.description || null,
      start_at: event.start_at,
      end_at: event.end_at,
      timezone: event.timezone,
      url: event.url || null,
      cover_url: event.cover_url || null,
      guest_count: event.guest_count,
      location_type: event.location?.type || null,
      location_name: event.location?.name || null,
      location_address: event.location?.address || null,
      visibility: event.visibility,
    }, {
      onConflict: 'luma_event_id',
    })

  if (error) {
    throw new Error(`Failed to upsert event: ${error.message}`)
  }
}

/**
 * Upsert a Luma guest to the database
 * Returns true if guest was newly created
 */
async function upsertLumaGuest(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  eventId: string,
  guest: LumaGuest
): Promise<boolean> {
  // Check if guest exists
  const { data: existing } = await supabase
    .from('luma_guests')
    .select('id')
    .eq('luma_guest_id', guest.id)
    .single()

  const isNew = !existing

  const { error } = await supabase
    .from('luma_guests')
    .upsert({
      luma_guest_id: guest.id,
      luma_event_id: eventId,
      guest_key: guest.guest_key,
      name: guest.name,
      email: guest.email.toLowerCase(),
      registration_status: guest.registration_status,
      approval_status: guest.approval_status || null,
      attendance_status: guest.attendance_status || null,
      registered_at: guest.created_at,
      synced_at: new Date().toISOString(),
    }, {
      onConflict: 'luma_guest_id',
    })

  if (error) {
    throw new Error(`Failed to upsert guest: ${error.message}`)
  }

  return isNew
}

/**
 * Assign a coupon to a Luma guest
 * Returns true if a new coupon was assigned
 */
async function assignCouponToGuest(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  guest: LumaGuest,
  eventId: string,
  sendEmail: boolean
): Promise<boolean> {
  const email = guest.email.toLowerCase()

  // Check if attendee already exists with this email
  const { data: existingAttendee } = await supabase
    .from('attendees')
    .select('id, coupon_code_id')
    .eq('email', email)
    .single()

  if (existingAttendee?.coupon_code_id) {
    // Already has a coupon assigned
    return false
  }

  // Find an available coupon
  const { data: couponCode, error: couponError } = await supabase
    .from('coupon_codes')
    .select()
    .eq('is_used', false)
    .is('used_at', null)
    .limit(1)
    .single()

  if (couponError || !couponCode) {
    console.warn('No available coupon codes')
    return false
  }

  if (existingAttendee) {
    // Update existing attendee with coupon and Luma references
    const { error: updateError } = await supabase
      .from('attendees')
      .update({
        coupon_code_id: couponCode.id,
        luma_guest_id: guest.id,
        luma_event_id: eventId,
        source: 'luma',
      })
      .eq('id', existingAttendee.id)

    if (updateError) {
      throw new Error(`Failed to update attendee: ${updateError.message}`)
    }
  } else {
    // Create new attendee
    const { error: insertError } = await supabase
      .from('attendees')
      .insert({
        name: guest.name,
        email: email,
        coupon_code_id: couponCode.id,
        luma_guest_id: guest.id,
        luma_event_id: eventId,
        source: 'luma',
        registered_at: guest.created_at,
      })

    if (insertError) {
      throw new Error(`Failed to create attendee: ${insertError.message}`)
    }
  }

  // Mark coupon as used
  const { error: couponUpdateError } = await supabase
    .from('coupon_codes')
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
    })
    .eq('id', couponCode.id)

  if (couponUpdateError) {
    throw new Error(`Failed to mark coupon as used: ${couponUpdateError.message}`)
  }

  // Send email notification
  if (sendEmail) {
    try {
      await sendCouponEmail({
        attendee: {
          id: existingAttendee?.id || 0,
          name: guest.name,
          email: email,
          coupon_code_id: couponCode.id,
          registered_at: guest.created_at,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        couponCode,
      })
    } catch (emailError) {
      console.error('Failed to send coupon email:', emailError)
      // Don't fail the sync if email fails
    }
  }

  return true
}
```

---

### 3. API Routes

**Location:** `src/app/api/admin/luma/test-connection/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { getLumaService } from '@/lib/luma/service'

export async function GET() {
  try {
    const luma = getLumaService()
    const result = await luma.testConnection()

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Successfully connected to Luma API',
        user: result.user,
      })
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    )
  } catch (error) {
    console.error('Luma connection test failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    )
  }
}
```

**Location:** `src/app/api/admin/luma/sync-events/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { syncLumaEvents } from '@/lib/luma/sync'

export async function POST() {
  try {
    const result = await syncLumaEvents()

    return NextResponse.json({
      success: result.success,
      eventsSynced: result.eventsSynced,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Failed to sync Luma events:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
```

**Location:** `src/app/api/admin/luma/sync-guests/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { syncLumaGuests } from '@/lib/luma/sync'
import { z } from 'zod'

const syncGuestsSchema = z.object({
  eventId: z.string().min(1),
  assignCoupons: z.boolean().optional().default(true),
  sendEmails: z.boolean().optional().default(true),
  status: z.enum(['confirmed', 'waitlist', 'declined', 'cancelled']).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = syncGuestsSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { eventId, assignCoupons, sendEmails, status } = validation.data

    const result = await syncLumaGuests(eventId, {
      assignCoupons,
      sendEmails,
      status,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to sync Luma guests:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
```

**Location:** `src/app/api/admin/luma/events/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createAdminClient()

    const { data: events, error } = await supabase
      .from('luma_events')
      .select('*')
      .order('start_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Failed to fetch Luma events:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch events' },
      { status: 500 }
    )
  }
}
```

---

### 4. Admin UI Component

**Location:** `src/components/admin/luma-events-management.tsx`

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { 
  RefreshCw, 
  Users, 
  Calendar, 
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

interface LumaEvent {
  id: number
  luma_event_id: string
  name: string
  start_at: string
  end_at: string
  guest_count: number
  url: string | null
  is_sync_enabled: boolean
  last_synced_at: string | null
}

export function LumaEventsManagement() {
  const [events, setEvents] = useState<LumaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncingEvents, setSyncingEvents] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/luma/events')
      const data = await response.json()
      setEvents(data.events || [])
    } catch (error) {
      toast.error('Failed to load Luma events')
      console.error(error)
    }
    setLoading(false)
  }, [])

  const checkConnection = useCallback(async () => {
    setConnectionStatus('checking')
    try {
      const response = await fetch('/api/admin/luma/test-connection')
      const data = await response.json()
      setConnectionStatus(data.success ? 'connected' : 'disconnected')
    } catch {
      setConnectionStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    fetchEvents()
    checkConnection()
  }, [fetchEvents, checkConnection])

  const handleSyncEvents = async () => {
    setSyncingEvents(true)
    try {
      const response = await fetch('/api/admin/luma/sync-events', {
        method: 'POST',
      })
      const data = await response.json()

      if (data.success) {
        toast.success(`Synced ${data.eventsSynced} events from Luma`)
        fetchEvents()
      } else {
        toast.error(data.errors?.[0] || 'Failed to sync events')
      }
    } catch (error) {
      toast.error('Failed to sync events')
      console.error(error)
    }
    setSyncingEvents(false)
  }

  const handleSyncGuests = async (eventId: string) => {
    setSyncing(eventId)
    try {
      const response = await fetch('/api/admin/luma/sync-guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      const data = await response.json()

      if (data.success) {
        toast.success(
          `Synced ${data.guestsSynced} guests. ` +
          `Added: ${data.guestsAdded}, Updated: ${data.guestsUpdated}, ` +
          `Coupons assigned: ${data.couponsAssigned}`
        )
        fetchEvents()
      } else {
        toast.error(data.errors?.[0] || 'Failed to sync guests')
      }
    } catch (error) {
      toast.error('Failed to sync guests')
      console.error(error)
    }
    setSyncing(null)
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Luma Connection</CardTitle>
            <CardDescription>API connection status</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {connectionStatus === 'checking' && (
              <Badge variant="secondary">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Checking...
              </Badge>
            )}
            {connectionStatus === 'connected' && (
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {connectionStatus === 'disconnected' && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
            <Button
              variant="outline"
              onClick={handleSyncEvents}
              disabled={syncingEvents || connectionStatus !== 'connected'}
            >
              {syncingEvents ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Events
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Luma Events</CardTitle>
          <CardDescription>
            Events synced from your Luma calendar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No events found. Click "Sync Events" to fetch from Luma.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{event.name}</span>
                        {event.url && (
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            <LinkIcon className="h-3 w-3" />
                            View on Luma
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{format(new Date(event.start_at), 'MMM d, yyyy')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{event.guest_count}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.last_synced_at
                        ? formatDistanceToNow(new Date(event.last_synced_at), { addSuffix: true })
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleSyncGuests(event.luma_event_id)}
                        disabled={syncing === event.luma_event_id}
                      >
                        {syncing === event.luma_event_id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sync Guests
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## Rate Limits & Performance

### Rate Limit Specifications

| Endpoint Type | Limit | Window | Per |
|---------------|-------|--------|-----|
| GET endpoints | 500 requests | 5 minutes | Calendar |
| POST endpoints | 100 requests | 5 minutes | Calendar |
| Block duration | 1 minute | - | - |

### Rate Limit Headers

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 498
X-RateLimit-Reset: 1638360000
```

### Best Practices

1. **Use Pagination** - Process guests in batches
2. **Add Delays** - Small delays between paginated requests
3. **Cache Event Data** - Don't re-fetch events repeatedly
4. **Monitor Rate Limits** - Log warnings when approaching limits
5. **Implement Backoff** - Handle 429 errors with exponential backoff

---

## Error Handling

### HTTP Status Codes

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Process response |
| 400 | Bad Request | Check request parameters |
| 401 | Unauthorized | Verify API key |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Verify resource ID |
| 429 | Too Many Requests | Implement backoff |
| 500 | Server Error | Retry with backoff |
| 503 | Service Unavailable | Retry later |

### Error Response Format

```json
{
  "error": {
    "message": "Event not found",
    "code": "EVENT_NOT_FOUND",
    "status": 404
  }
}
```

---

## Security Considerations

### API Key Security

1. **Never commit API keys to version control**
2. **Use environment variables** - Always load from `process.env`
3. **Rotate API keys periodically** - Every 90 days recommended
4. **Restrict server-side only** - API key should never be exposed to client

### Data Security

1. **Use Supabase Admin Client** - Bypasses RLS for sync operations
2. **Validate all inputs** - Use Zod schemas
3. **Log sync activities** - Track who triggered syncs and results
4. **Encrypt PII** - Consider encrypting email addresses at rest

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Set up Luma Plus account and generate API key
- [ ] Add environment variables
- [ ] Create TypeScript types (`src/types/luma.ts`)
- [ ] Implement `LumaService` class
- [ ] Run database migrations
- [ ] Test API connectivity

### Phase 2: Core Integration (Week 1-2)
- [ ] Implement sync logic (`src/lib/luma/sync.ts`)
- [ ] Create API routes
- [ ] Implement rate limit handling
- [ ] Add error handling and logging

### Phase 3: Coupon Assignment (Week 2)
- [ ] Integrate with existing coupon assignment flow
- [ ] Handle duplicate prevention
- [ ] Test email notifications
- [ ] Add sync logging

### Phase 4: Admin Interface (Week 3)
- [ ] Create `LumaEventsManagement` component
- [ ] Add to admin navigation/sidebar
- [ ] Display sync status and history
- [ ] Add manual sync triggers

### Phase 5: Testing & Documentation (Week 4)
- [ ] Write unit tests for LumaService
- [ ] Write integration tests
- [ ] Update CLAUDE.md with Luma integration info
- [ ] Test end-to-end flow

---

## Quick Start Checklist

```bash
# 1. Add environment variables to .env.local
LUMA_API_KEY=your_luma_api_key_here
LUMA_API_BASE_URL=https://public-api.luma.com
LUMA_CALENDAR_ID=your_calendar_id

# 2. Run database migrations in Supabase SQL Editor
# Copy contents of supabase-schema-luma.sql

# 3. Create the implementation files
# - src/types/luma.ts
# - src/lib/luma/service.ts
# - src/lib/luma/sync.ts
# - src/app/api/admin/luma/*/route.ts
# - src/components/admin/luma-events-management.tsx

# 4. Test API connection
curl http://localhost:3000/api/admin/luma/test-connection

# 5. Sync events
curl -X POST http://localhost:3000/api/admin/luma/sync-events

# 6. Sync guests for an event
curl -X POST http://localhost:3000/api/admin/luma/sync-guests \
  -H "Content-Type: application/json" \
  -d '{"eventId": "evt-abc123"}'
```

---

## Additional Resources

### Official Documentation
- **API Reference:** https://docs.luma.com/reference
- **Getting Started:** https://docs.luma.com/reference/getting-started-with-your-api
- **Rate Limits:** https://docs.luma.com/reference/rate-limits

### Code Examples
- **Basketball Club Example:** https://github.com/luma-team/basketball-club-example

### Support
- **Email:** support@lu.ma
- **Help Center:** https://help.luma.com/p/luma-api

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-12-06 | Initial | Technical specification adapted for Next.js/TypeScript/Supabase |

---

**End of Document**
