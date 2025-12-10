# Cafe Cursor

A simple event registration and coupon distribution system for Cafe Cursor community events. Built for Cursor Ambassadors worldwide to easily manage their local events.

## What is this?

Cafe Cursor helps you:
1. **Collect registrations** from attendees at your events
2. **Distribute Cursor coupon codes** automatically via email
3. **Sync with Luma** (optional) to automatically import guests from your Luma events

Each city gets its own deployment - no coding required after initial setup!

> **Note:** The app works great with just Resend for emails! Luma integration is completely optional - only needed if you want to auto-import guests from Luma events.

## Features

### For Attendees
- Simple registration form at your event
- Automatic coupon code delivery via email

### For Ambassadors (Admin)
- **Dashboard** - See registrations and coupon stats at a glance
- **Attendee Management** - Search, filter, and manage registrations
- **Coupon Management** - Add coupon codes (bulk import supported)
- **Email Resend** - Resend coupon emails if needed
- **Settings** - Configure your city name, timezone, and API keys (all in-app!)

### Luma Integration (Optional)
If you use Luma for event management, you can also:
- Connect your Luma account via API key
- Select which event to sync
- Import confirmed guests automatically
- Coupons assigned and emailed instantly

> Don't use Luma? No problem! Just share your registration link (`/register`) and attendees will get their coupons automatically.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS v4
- **Email**: Resend
- **Event Integration**: Luma API
- **Hosting**: Vercel

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Supabase account (free tier works great)
- Resend account (free tier = 3,000 emails/month - plenty for most events!)
- Luma Plus subscription (optional - only if you want to sync guests from Luma)

## Setup

### 1. Clone and Install

```bash
cd cafe-cursor-credits
npm install
```

### 2. Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env.local
```

Required variables:

```env
# Supabase Configuration (from your Supabase project settings)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Admin Registration Secret (create a strong secret phrase)
ADMIN_REGISTRATION_SECRET=your_secret_phrase_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** Luma and Resend API keys are configured in the admin Settings page, not as environment variables. This makes it easy for ambassadors to update them without touching code!

### 3. Database Setup

Run the SQL schemas in your Supabase SQL Editor in this order:

1. **Base Schema** - `supabase-schema.sql`
   - Creates `coupon_codes` and `attendees` tables
   - Sets up Row Level Security policies

2. **Luma Schema** - `docs/supabase-schema-luma.sql`
   - Creates `luma_events`, `luma_guests`, and `luma_sync_logs` tables
   - Adds Luma reference columns to attendees

3. **Settings Schema** - `docs/supabase-schema-settings.sql`
   - Creates `app_settings` table for city configuration

### 4. Create First Admin

Admins self-register using a secret phrase:

1. Share the `ADMIN_REGISTRATION_SECRET` with your city organizer (securely!)
2. Navigate to `/admin-register`
3. Fill in name, email, password, and the registration secret
4. First admin will be redirected to `/admin/settings` to configure the city

### 5. Configure City Settings

After first admin registration:

1. Go to `/admin/settings`
2. Enter your city name (e.g., "Toronto", "Chiang Mai")
3. Select your timezone from the searchable dropdown
4. Save settings

The city name will appear as "Cafe Cursor {City Name}" throughout the app.

### 6. Configure API Keys (In-App)

After logging in as admin, go to **Settings** (`/admin/settings`) to configure:

#### Resend (Required - for sending emails)
1. Sign up at [resend.com](https://resend.com) - **free tier includes 3,000 emails/month!**
2. Get your API key from the Resend dashboard
3. Paste it in the Settings page under "Integrations"

#### Luma (Optional - for syncing event guests)
1. You need a [Luma Plus](https://lu.ma) subscription
2. Go to [Luma Settings > API](https://lu.ma/settings/api-keys)
3. Generate an API key
4. Paste it in the Settings page under "Integrations"
5. Go to the Luma page (`/admin/luma`) to connect your event

> **Without Luma:** The app works perfectly! Attendees register at `/register` and receive coupons via email automatically.

### 7. Run Development Server

```bash
npm run dev
```

Visit:
- `http://localhost:3000` - Redirects to registration
- `http://localhost:3000/register` - Public registration form
- `http://localhost:3000/login` - Admin login
- `http://localhost:3000/admin-register` - Admin self-registration
- `http://localhost:3000/admin/dashboard` - Admin dashboard
- `http://localhost:3000/admin/settings` - City configuration
- `http://localhost:3000/admin/luma` - Luma event management

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── assign-coupon/
│   │   │   ├── luma/
│   │   │   │   ├── events/
│   │   │   │   ├── sync-events/
│   │   │   │   ├── sync-guests/
│   │   │   │   └── test-connection/
│   │   │   ├── send-email/
│   │   │   └── settings/
│   │   ├── admin-register/
│   │   ├── auth/
│   │   │   └── logout/
│   │   ├── register/
│   │   └── settings/
│   │       └── public/
│   ├── admin/
│   │   ├── attendees/
│   │   ├── coupons/
│   │   ├── dashboard/
│   │   ├── luma/
│   │   ├── settings/
│   │   └── layout.tsx
│   ├── admin-register/
│   ├── login/
│   └── register/
├── components/
│   ├── admin/
│   │   ├── attendee-management.tsx
│   │   ├── coupon-management.tsx
│   │   ├── dashboard-attendees-table.tsx
│   │   ├── header.tsx
│   │   ├── luma-events-management.tsx
│   │   ├── recent-attendees-table.tsx
│   │   └── sidebar.tsx
│   └── ui/
│       └── (shadcn components)
├── lib/
│   ├── emails/
│   │   ├── coupon-email.ts
│   │   └── send-coupon-email.ts
│   ├── luma/
│   │   ├── service.ts
│   │   └── sync.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── middleware.ts
│   │   └── server.ts
│   ├── resend.ts
│   └── utils.ts
├── types/
│   ├── database.ts
│   └── luma.ts
└── middleware.ts
```

## Admin Onboarding

### How It Works

1. **Secret-Based Registration**: City organizers share a secret phrase offline
2. **Self-Service**: New admins register at `/admin-register` with the secret
3. **First Admin Setup**: First admin configures city settings
4. **Full Access**: All admins have equal access to the admin dashboard

### Security

- Registration secret validated server-side only
- Never stored in database or exposed to client
- Rotate secret after initial admin setup
- Share via secure channels only (Signal, encrypted email)

## Quick Start for Ambassadors

Already have a deployed instance? Here's how to get started:

1. **Get your admin credentials** from whoever set up the deployment
2. **Log in** at `/login`
3. **Go to Settings** (`/admin/settings`) and configure:
   - Your city name (e.g., "Toronto", "Berlin", "Singapore")
   - Your timezone
   - Resend API key (for emails) - **required**
   - Luma API key (for syncing guests) - *optional*
4. **Add coupon codes** at `/admin/coupons` (bulk import supported!)
5. **Share your registration link** (`/register`) with attendees

### Using Luma? (Optional)

If you manage your events on Luma:
1. Add your Luma API key in Settings
2. Go to **Luma** (`/admin/luma`)
3. Connect your event and sync guests
4. Coupons are assigned and emailed automatically!

## Luma Integration (Optional)

Skip this section if you don't use Luma for events.

### Setting Up Luma

1. Go to **Settings** (`/admin/settings`)
2. Add your Luma API key (get it from [lu.ma/settings/api-keys](https://lu.ma/settings/api-keys))
3. Go to **Luma** (`/admin/luma`)
4. Enter your Luma event URL or ID and click "Connect Event"

### Syncing Guests

1. On the Luma page, click "Sync Guests"
2. Confirmed guests are automatically imported
3. Available coupon codes are assigned to each guest
4. Emails with coupon codes are sent automatically

### How It Works

```
Your Luma Event → Sync Guests → Attendees Created → Coupons Assigned → Emails Sent
```

That's it! Guests receive their coupon codes automatically.

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_REGISTRATION_SECRET`
   - `NEXT_PUBLIC_APP_URL` (your Vercel URL)
4. Deploy

### 3. Update Supabase

Add your Vercel URL to Supabase:
1. Go to Authentication → URL Configuration
2. Add your Vercel URL to the redirect URLs

### 4. Post-Deployment

1. Share `ADMIN_REGISTRATION_SECRET` with your city ambassador (securely!)
2. Ambassador registers at `/admin-register`
3. Ambassador configures city settings and API keys in `/admin/settings`
4. Ambassador adds coupon codes
5. Ambassador connects their Luma event
6. Ready to go!

## Development

### Adding New Components

```bash
npx shadcn@latest add [component-name]
```

### Type Generation (Optional)

Generate TypeScript types from your Supabase schema:

```bash
npx supabase gen types typescript --project-id your-project-id > src/types/database.ts
```

### Database Migrations

For schema changes, update the SQL files in `docs/` and run in Supabase SQL Editor.

## Multi-City Deployment

This app follows a **single-city-per-deployment** architecture. Each city gets its own instance!

### For New Cities

1. Fork/clone this repository
2. Create a new Supabase project
3. Run the database migrations
4. Deploy to Vercel with environment variables
5. Share the admin registration secret with your city ambassador
6. Ambassador configures everything else in the app!

### What Ambassadors Configure (In-App)

- City name and timezone
- Luma API key
- Resend API key
- Luma event connection
- Coupon codes

No code changes needed once deployed!

## Need Help?

- Check the [docs/](docs/) folder for detailed guides
- Reach out to the Cursor team for support

## License

Proprietary software developed for Cafe Cursor community events.
