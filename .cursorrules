# Cafe Cursor - Project Rules

## Project Overview

Event registration system for managing attendee registrations and distributing coupon codes via email. Single-city-per-deployment architecture with optional Luma event integration.

## Tech Stack

- Next.js 15 (App Router) with TypeScript
- Supabase (PostgreSQL) for database and authentication
- shadcn/ui components with Tailwind CSS v4
- Resend for email delivery
- Luma API for event integration
- Zod for schema validation

## Quick Commands

- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run lint` - Run ESLint
- `npx shadcn@latest add [component]` - Add shadcn/ui component

## Code Patterns

### Supabase Clients

```typescript
// User operations (respects RLS)
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()

// Admin operations (bypasses RLS)
import { createAdminClient } from '@/lib/supabase/server'
const supabase = await createAdminClient()

// Browser/Client Components
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```

### Form Validation

```typescript
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
})

const result = schema.safeParse(body)
if (!result.success) {
  return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
}
```

### API Route Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createAdminClient()
    // Validate, process, return response
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
```

### Sending Emails

```typescript
import { createAdminClient } from '@/lib/supabase/server'
import { createResendClient } from '@/lib/resend'
import { sendCouponEmail } from '@/lib/emails/send-coupon-email'

const supabase = await createAdminClient()
const { data: settings } = await supabase
  .from('app_settings')
  .select('resend_api_key, city_name')
  .limit(1)
  .single()

if (settings?.resend_api_key) {
  const resendClient = createResendClient(settings.resend_api_key)
  await sendCouponEmail({ resendClient, attendee, couponCode, fromName: `Cafe Cursor ${settings.city_name}` })
}
```

### Luma Integration

Luma guests are kept separate from regular attendees. Sync only imports guest data; coupon assignment and emails are manual.

```typescript
import { syncLumaGuests } from '@/lib/luma/sync'

// Sync only imports guest data to luma_guests table
const result = await syncLumaGuests(eventId, { status: 'confirmed' })
```

For coupon assignment and emails, use the dedicated endpoints:
- `POST /api/admin/luma/guests/assign-coupon` - Assign coupon to Luma guest
- `POST /api/admin/luma/guests/send-email` - Send email to Luma guest with coupon

## File Organization

- `src/app/` - Pages and API routes
- `src/app/api/admin/luma/guests/` - Luma guest management endpoints
- `src/components/ui/` - shadcn/ui components (don't modify)
- `src/components/admin/` - Admin components
- `src/lib/luma/` - Luma API integration
- `src/lib/emails/` - Email templates
- `src/types/` - TypeScript types

## Database Tables

- `attendees` - Website/manual registrations with coupon assignments
- `coupon_codes` - Coupon inventory with `used_by_type` (attendee/luma_guest) tracking
- `app_settings` - City configuration (singleton)
- `luma_events` - Synced Luma events
- `luma_guests` - Synced Luma guests with `coupon_code_id` and `email_sent_at`
- `luma_sync_logs` - Sync history

## Authentication

- Public: `/`, `/register`, `/login`, `/admin-register`
- Protected: `/admin/*` (requires Supabase auth)
- Admin registration uses `ADMIN_REGISTRATION_SECRET` env var

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_REGISTRATION_SECRET`
- `NEXT_PUBLIC_APP_URL`

API keys (Luma, Resend) are stored in `app_settings` table and configured via admin Settings page.

## Best Practices

1. Use `createAdminClient()` for data modifications or bypassing RLS
2. Validate all API inputs with Zod
3. Handle errors gracefully with console logging
4. Use Server Components for data fetching
5. Keep sensitive operations server-side
6. Use toast notifications (sonner) for admin feedback
7. Follow existing patterns in `src/components/admin/`
