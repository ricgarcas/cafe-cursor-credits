# Cafe Cursor - Next.js

A modern event registration and coupon distribution system for Cafe Cursor community events. Built with Next.js 15, Supabase, and Resend. Supports single-city deployments with Luma event integration.

## Features

### Public Features
- **Event Registration** - Simple registration form at `/register`
- **Automatic Coupon Assignment** - Registrants receive an available coupon code
- **Email Notification** - Coupon codes delivered via Resend immediately
- **Dynamic City Branding** - City name configurable via admin settings

### Admin Features
- **Dashboard** - Overview of registrations and coupon distribution
- **Attendee Management** - Search, filter, and manage registered attendees
- **Coupon Management** - Create, edit, delete, and track coupon codes
- **Email Operations** - Send/resend coupon emails to attendees
- **Bulk Import** - Import multiple coupon codes at once
- **CSV Export** - Export attendee data
- **Settings** - Configure city name and timezone
- **Admin Self-Registration** - New admins can register with a secret phrase

### Luma Integration
- **Event Sync** - Automatically sync events from your Luma calendar
- **Guest Sync** - Import guest lists from Luma events
- **Auto-Coupon Assignment** - Assign coupons to confirmed Luma guests
- **Sync Logging** - Track sync history and results

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
- Supabase account
- Resend account
- Luma Plus subscription (for event integration)

## Setup

### 1. Clone and Install

```bash
cd cafe-cursor-toronto-nextjs
npm install
```

### 2. Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env.local
```

Required variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Resend Email Configuration
RESEND_API_KEY=re_your_resend_api_key

# Luma API Configuration (optional - for event integration)
LUMA_API_KEY=your_luma_api_key_here
LUMA_API_BASE_URL=https://public-api.luma.com
LUMA_CALENDAR_ID=cal-xxxxxxxx

# Admin Registration Secret
ADMIN_REGISTRATION_SECRET=your_secret_phrase_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

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

### 6. Resend Configuration

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. Verify your sending domain (optional for production)
4. Update the `from` address in `src/lib/emails/send-coupon-email.ts`

### 7. Luma Configuration (Optional)

For event integration:

1. Subscribe to [Luma Plus](https://lu.ma)
2. Generate an API key from Luma Settings > API
3. Find your calendar ID from your Luma calendar URL
4. Add credentials to `.env.local`
5. Test connection in admin panel at `/admin/luma`

### 8. Run Development Server

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

## Luma Integration

### Syncing Events

1. Go to `/admin/luma`
2. Click "Sync Events" to fetch events from your Luma calendar
3. Events are stored locally for guest syncing

### Syncing Guests

1. Click "Sync Guests" on any event
2. Confirmed guests are imported to the local database
3. Available coupons are automatically assigned
4. Email notifications sent to new attendees

### Data Flow

```
Luma Calendar → Sync Events → Local Events
                     ↓
Luma Guests → Sync Guests → Local Guests → Attendees → Coupon Assignment → Email
```

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
3. Configure environment variables (all from `.env.local`)
4. Deploy

### 3. Update Supabase

Add your Vercel URL to Supabase:
1. Go to Authentication → URL Configuration
2. Add your Vercel URL to the redirect URLs

### 4. Post-Deployment

1. Share `ADMIN_REGISTRATION_SECRET` with city organizer
2. First admin registers and configures city settings
3. Test registration and email flow
4. Connect Luma (if using)

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

This app follows a **single-city-per-deployment** architecture:

- Each city gets its own app instance
- Each city has its own Supabase project
- No data sharing between cities
- Cities can customize independently

To deploy for a new city:
1. Fork/clone the repository
2. Create new Supabase project
3. Configure environment variables
4. Deploy to Vercel
5. First admin registers and configures city

## License

Proprietary software developed for Cafe Cursor community events.
