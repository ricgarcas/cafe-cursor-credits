# Cafe Cursor

Event registration and coupon distribution system for Cafe Cursor community events. Built for Cursor Ambassadors worldwide.

## Features

### For Attendees
- Simple registration form at your event
- Automatic coupon code delivery via email

### For Ambassadors (Admin)
- **Dashboard** - Registrations and coupon stats
- **Attendee Management** - Search, filter, manage registrations
- **Coupon Management** - Add codes (bulk import supported), track usage source
- **Email Resend** - Resend coupon emails if needed
- **Settings** - Configure city, timezone, and API keys

### Luma Integration (Optional)
- Connect Luma account via API key
- Sync confirmed guests from your event
- Manual coupon assignment per guest
- Send emails individually or resend as needed

## Tech Stack

- Next.js 15 (App Router) with TypeScript
- Supabase (PostgreSQL + Auth)
- shadcn/ui + Tailwind CSS v4
- Resend for emails
- Luma API for event sync

## Prerequisites

- Node.js 18+
- Supabase account
- Resend account (free: 3,000 emails/month)
- Luma Plus subscription (optional)

## Setup

### 1. Install

```bash
npm install
cp env.example .env.local
```

### 2. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_REGISTRATION_SECRET=your_secret_phrase
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database

Run migrations in Supabase SQL Editor from `supabase/migrations/` folder in order.

### 4. Create Admin

1. Navigate to `/admin-register`
2. Enter name, email, password, and registration secret
3. Configure city settings at `/admin/settings`

### 5. Run

```bash
npm run dev
```

## Routes

| Route | Description |
|-------|-------------|
| `/register` | Public registration form |
| `/login` | Admin login |
| `/admin-register` | Admin self-registration |
| `/admin/dashboard` | Admin dashboard |
| `/admin/attendees` | Attendee management |
| `/admin/coupons` | Coupon management |
| `/admin/luma` | Luma event sync |
| `/admin/settings` | City and API configuration |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── assign-coupon/
│   │   │   ├── luma/
│   │   │   │   ├── events/
│   │   │   │   ├── guests/
│   │   │   │   ├── sync-guests/
│   │   │   │   └── test-connection/
│   │   │   ├── send-email/
│   │   │   └── settings/
│   │   ├── register/
│   │   └── settings/public/
│   └── admin/
├── components/
│   ├── admin/
│   └── ui/
├── lib/
│   ├── emails/
│   ├── luma/
│   └── supabase/
└── types/
```

## Luma Workflow

1. Add Luma API key in Settings
2. Go to Luma page, connect your event
3. Click "Sync Guests" to import guest list
4. For each guest: Assign Coupon → Send Email
5. Filter by status to track progress

Luma guests are kept separate from regular attendees. Coupon management shows source (Attendee/Luma).

## Deployment

### Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

### Post-Deployment

1. Add Vercel URL to Supabase Auth redirect URLs
2. Share admin secret with ambassador
3. Ambassador configures settings and adds coupons

## Multi-City

Each city gets its own deployment:

1. Fork repository
2. Create new Supabase project
3. Run migrations
4. Deploy to Vercel
5. Ambassador configures everything in-app

## License

Proprietary software for Cafe Cursor community events.
