# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

- `npm run dev` - Start development server (http://localhost:3000)
- `npm run build` - Production build
- `npm start` - Run production server
- `npm run lint` - Run ESLint

## Project Overview

Cafe Cursor Toronto is an event registration system for managing attendee registrations and distributing coupon codes via email. The app handles public registrations, automatic coupon assignment, and an admin dashboard for managing attendees and coupons.

**Tech Stack:**
- Next.js 15 (App Router) with TypeScript
- Supabase (PostgreSQL) for database and authentication
- shadcn/ui components with Tailwind CSS v4
- Resend for email delivery
- Zod for schema validation

## Architecture

### Authentication & Middleware

The app uses Supabase Auth with session-based cookie authentication managed through middleware.

**Key Files:**
- `src/middleware.ts` - Entry point that calls the Supabase session update logic
- `src/lib/supabase/middleware.ts` - Handles session management and route protection:
  - Protects `/admin/*` routes (redirects to `/login` if not authenticated)
  - Redirects authenticated users away from `/login` to `/admin/dashboard`
  - Updates session cookies for all requests

### Supabase Clients

Two client types are used depending on context:

- **User Client** (`createClient()` from `src/lib/supabase/server.ts`) - Uses anonymous key, respects RLS (Row Level Security) policies
- **Admin Client** (`createAdminClient()` from `src/lib/supabase/server.ts`) - Uses service role key, bypasses RLS for privileged operations (registration, coupon assignment)

Both clients handle cookies automatically through Next.js cookie helpers.

### Database Schema

Two main tables (see `supabase-schema.sql`):

1. **attendees** - Stores registration data:
   - `id, name, email, coupon_code_id, registered_at`
   - Foreign key to `coupon_codes`

2. **coupon_codes** - Stores coupon inventory:
   - `id, code, is_used, used_at`
   - Tracks usage status

Row Level Security policies restrict direct access; admin operations use the service role key.

### Request Flow

**Registration Flow (`/api/register`):**
1. Validate input with Zod schema
2. Check for duplicate email
3. Create attendee record
4. Find first available unused coupon
5. Assign coupon to attendee and mark as used
6. Send coupon email via Resend
7. Return success response (email failure is non-blocking)

**Admin Operations:**
- Use `createAdminClient()` to bypass RLS
- Examples: assigning coupons manually, bulk imports, sending emails

## Directory Structure

```
src/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── assign-coupon/   - Manual coupon assignment
│   │   │   └── send-email/      - Resend coupon emails
│   │   ├── auth/
│   │   │   └── logout/          - Logout endpoint
│   │   └── register/            - Public registration endpoint
│   ├── admin/
│   │   ├── dashboard/           - Admin overview
│   │   ├── attendees/           - Attendee management
│   │   ├── coupons/            - Coupon management
│   │   └── layout.tsx          - Admin layout with sidebar
│   ├── login/                  - Login page
│   ├── register/               - Public registration page
│   └── layout.tsx              - Root layout
├── components/
│   ├── admin/
│   │   ├── attendee-management.tsx  - Attendee CRUD UI
│   │   ├── coupon-management.tsx    - Coupon CRUD UI
│   │   ├── header.tsx               - Admin header
│   │   ├── recent-attendees-table.tsx
│   │   └── sidebar.tsx              - Navigation sidebar
│   └── ui/                     - shadcn/ui component library
├── lib/
│   ├── emails/
│   │   ├── coupon-email.ts     - Email template
│   │   └── send-coupon-email.ts - Resend API wrapper
│   ├── supabase/
│   │   ├── client.ts           - Browser Supabase client
│   │   ├── server.ts           - Server Supabase clients (user + admin)
│   │   └── middleware.ts       - Session management
│   ├── resend.ts              - Resend client initialization
│   └── utils.ts               - Utility functions (cn() for Tailwind merge)
├── types/
│   └── database.ts            - Supabase schema TypeScript types
└── middleware.ts              - Next.js middleware entry point
```

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin operations)
- `RESEND_API_KEY` - Resend email API key
- `NEXT_PUBLIC_APP_URL` - Application URL (http://localhost:3000 for dev)

See `env.example` for template.

## Key Patterns

### Form Validation

Uses `zod` for runtime schema validation. Example in `/api/register`:
```typescript
const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
})
const result = registerSchema.safeParse(body)
```

### Component Styling

Tailwind CSS v4 with `clsx` and `tailwind-merge` via `cn()` utility in `src/lib/utils.ts`.

### shadcn/ui Components

Add new components with: `npx shadcn@latest add [component-name]`

Existing components are in `src/components/ui/` and are pre-configured with radix-ui.

## Common Development Tasks

### Adding a New Page
1. Create route file in `src/app/[route]/page.tsx`
2. Use `createClient()` or `createAdminClient()` for data fetching in Server Components
3. Export components from `src/components/` for client-side interactivity

### Creating API Endpoints
1. Create route handler in `src/app/api/[route]/route.ts`
2. Use `createAdminClient()` for protected operations
3. Validate input with Zod
4. Return `NextResponse.json()` with appropriate status codes

### Working with Supabase
- Server Components: use `createClient()` or `createAdminClient()` from `src/lib/supabase/server.ts`
- Client Components: use `createClient()` from `src/lib/supabase/client.ts` (browser-safe)
- Always handle errors and log to console for debugging

### Sending Emails
Use the pattern in `src/lib/emails/send-coupon-email.ts`:
```typescript
import { resend } from '@/lib/resend'
await resend.emails.send({
  from: 'your@domain.com',
  to: recipient,
  subject: '...',
  html: '...',
})
```

## Deployment to Vercel

1. Push code to GitHub
2. Import repository in Vercel dashboard
3. Set environment variables (from .env.local)
4. Deploy
5. Update Supabase Authentication → URL Configuration with Vercel URL
