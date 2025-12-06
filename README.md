# Cafe Cursor Toronto - Next.js

A modern event registration system for Cafe Cursor Toronto, built with Next.js 15, Supabase, and Resend. Features automatic coupon code distribution to registered attendees via email.

## Features

### Public Features
- **Event Registration** - Simple registration form at `/register`
- **Automatic Coupon Assignment** - Registrants receive an available coupon code
- **Email Notification** - Coupon codes delivered via Resend immediately

### Admin Features
- **Dashboard** - Overview of registrations and coupon distribution
- **Attendee Management** - Search, filter, and manage registered attendees
- **Coupon Management** - Create, edit, delete, and track coupon codes
- **Email Operations** - Send/resend coupon emails to attendees
- **Bulk Import** - Import multiple coupon codes at once
- **CSV Export** - Export attendee data

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS v4
- **Email**: Resend
- **Hosting**: Vercel

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Supabase account
- Resend account

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
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin operations)
- `RESEND_API_KEY` - Your Resend API key
- `NEXT_PUBLIC_APP_URL` - Your app URL (http://localhost:3000 for dev)

### 3. Database Setup

Run the SQL schema in your Supabase SQL Editor:

```bash
# The schema is in supabase-schema.sql
```

This creates:
- `coupon_codes` table
- `attendees` table
- Row Level Security policies
- Indexes and triggers

### 4. Create Admin User

Create an admin user in Supabase Authentication:
1. Go to your Supabase Dashboard → Authentication → Users
2. Click "Add user" → "Create new user"
3. Enter email and password
4. Use these credentials to log in at `/login`

### 5. Resend Configuration

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. Verify your sending domain (optional for production)
4. Update the `from` address in `src/lib/emails/send-coupon-email.ts`

### 6. Run Development Server

```bash
npm run dev
```

Visit:
- `http://localhost:3000` - Redirects to registration
- `http://localhost:3000/register` - Public registration form
- `http://localhost:3000/login` - Admin login
- `http://localhost:3000/admin/dashboard` - Admin dashboard

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── assign-coupon/
│   │   │   └── send-email/
│   │   ├── auth/
│   │   │   └── logout/
│   │   └── register/
│   ├── admin/
│   │   ├── attendees/
│   │   ├── coupons/
│   │   ├── dashboard/
│   │   └── layout.tsx
│   ├── login/
│   └── register/
├── components/
│   ├── admin/
│   │   ├── attendee-management.tsx
│   │   ├── coupon-management.tsx
│   │   ├── header.tsx
│   │   ├── recent-attendees-table.tsx
│   │   └── sidebar.tsx
│   └── ui/
│       └── (shadcn components)
├── lib/
│   ├── emails/
│   │   ├── coupon-email.ts
│   │   └── send-coupon-email.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── middleware.ts
│   │   └── server.ts
│   ├── resend.ts
│   └── utils.ts
├── types/
│   └── database.ts
└── middleware.ts
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
3. Configure environment variables
4. Deploy

### 3. Update Supabase

Add your Vercel URL to Supabase:
1. Go to Authentication → URL Configuration
2. Add your Vercel URL to the redirect URLs

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

## License

Proprietary software developed for Cafe Cursor Toronto.
