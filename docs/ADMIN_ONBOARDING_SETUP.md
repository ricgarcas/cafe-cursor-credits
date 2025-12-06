# Admin Onboarding Setup Guide

**Document Version:** 1.1  
**Date:** December 6, 2024  
**Project:** Cafe Cursor - Single City Deployment with Luma Integration

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Security Overview](#security-overview)
4. [Environment Variables Setup](#environment-variables-setup)
5. [App Settings (Database)](#app-settings-database)
6. [Admin Self-Registration Flow](#admin-self-registration-flow)
7. [Permissions Model](#permissions-model)
8. [Luma Integration Setup](#luma-integration-setup)
9. [Deployment Checklist for New City](#deployment-checklist-for-new-city)
10. [Security Best Practices](#security-best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

This document provides a comprehensive guide for setting up admin onboarding for a single-city Cafe Cursor deployment with Luma event integration. It covers secure credential storage, admin registration, and city-specific configuration.

### Purpose

- Enable city organizers to self-register as admins
- Securely manage API credentials and sensitive data
- Configure city-specific settings via admin UI
- Provide a repeatable deployment process for new cities

---

## Architecture

This application follows a **single-city-per-deployment** architecture:

| Aspect | Description |
|--------|-------------|
| **Deployment Model** | One app instance = One city |
| **Data Scope** | All attendees and coupons belong to that city only |
| **Admin Access** | Admins can view and manage the full database |
| **Public Access** | Unauthenticated users only see the registration form |

### Why Single City Per App?

- **Simplicity:** No complex multi-tenant logic needed
- **Isolation:** Each city's data is completely separate
- **Flexibility:** Cities can customize their deployment independently
- **Security:** No risk of cross-city data leakage

---

## Security Overview

Understanding where different types of data should be stored is critical for security.

### Data Storage Locations

| Data Type | Storage Location | Reason |
|-----------|------------------|--------|
| API Keys (Luma, Resend) | Environment variables **only** | Secret credentials - never in DB |
| Supabase Service Role Key | Environment variables **only** | Full database access - highly sensitive |
| Admin Registration Secret | Environment variables **only** | Controls who can become an admin |
| Luma Calendar ID | Environment variable | Required for API calls |
| City name, timezone | **Database** (`app_settings`) | Editable via admin settings UI |
| Attendee data | Database | Managed through the application |
| Coupon codes | Database | Managed through the application |

### What NOT to Store in the Database

Never store the following in your database or expose in client-side code:

- `LUMA_API_KEY` - Provides full access to your Luma account
- `RESEND_API_KEY` - Could be used to send emails on your behalf
- `SUPABASE_SERVICE_ROLE_KEY` - Bypasses all Row Level Security
- `ADMIN_REGISTRATION_SECRET` - Would allow anyone to become an admin

---

## Environment Variables Setup

Environment variables are for **sensitive credentials only**. Non-sensitive configuration is stored in the database (see [App Settings](#app-settings-database)).

All environment variables should be set in `.env.local` for local development, and in your hosting provider's environment settings for production (e.g., Vercel Environment Variables).

### Complete Environment Variables Reference

```env
# ============================================
# SENSITIVE CREDENTIALS
# Never share, commit, or store in database
# ============================================

# Supabase Configuration
# Get these from: Supabase Dashboard > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Resend Email Configuration
# Get this from: https://resend.com/api-keys
RESEND_API_KEY=re_your_resend_api_key

# Luma API Configuration
# Get this from: Luma Dashboard > Settings > API (requires Luma Plus)
LUMA_API_KEY=your_luma_api_key_here
LUMA_API_BASE_URL=https://public-api.luma.com
LUMA_CALENDAR_ID=cal-xxxxxxxx

# Admin Registration Secret
# Create a strong, unique phrase that city organizers will use to register
# Share this ONLY with trusted individuals who should have admin access
ADMIN_REGISTRATION_SECRET=your_secret_phrase_here

# ============================================
# APP CONFIGURATION
# ============================================

# Application URL (use localhost for dev, production URL for deploy)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Getting Your API Keys

#### Luma API Key
1. Sign up for [Luma Plus](https://lu.ma) (required for API access)
2. Go to Settings > API in your Luma dashboard
3. Generate a new API key
4. Copy and store securely - it won't be shown again

#### Resend API Key
1. Create an account at [resend.com](https://resend.com)
2. Go to API Keys section
3. Create a new API key with sending permissions
4. Copy the key (starts with `re_`)

#### Luma Calendar ID
1. Open your Luma calendar page
2. The calendar ID is in the URL: `https://lu.ma/calendar/cal-XXXXXXXX`
3. Or find it via the Luma API: `GET /v1/calendar/list-calendars`

---

## App Settings (Database)

Non-sensitive configuration is stored in the `app_settings` table and can be edited through the admin Settings page. This allows admins to customize their city without redeploying.

### Database Schema

Run `supabase-schema-settings.sql` to create the settings table:

```sql
CREATE TABLE public.app_settings (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  -- City Information
  city_name TEXT NOT NULL DEFAULT 'Cafe Cursor',
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Available Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `city_name` | Text | Display name for the city | "Cafe Cursor" |
| `timezone` | Text | IANA timezone string | "America/Toronto" |

### Admin Settings UI

Admins can edit these settings at `/admin/settings`:

- **City Name** - Display name shown throughout the app
- **Timezone** - Used for date/time formatting

### Initial Settings

When the first admin registers, the app should prompt them to configure initial settings:

1. City name (required)
2. Timezone (required)

---

## Admin Self-Registration Flow

Admins can self-register using a secret phrase that's shared offline by the city organizer.

### Registration Process

1. **Access Registration Page**
   - Navigate to the admin registration route
   
2. **Enter Required Information**
   - Full name
   - Email address
   - Password (meets Supabase requirements)
   - **Registration Secret** (provided by existing admin/organizer)

3. **Server-Side Validation**
   ```
   User submits form
         │
         ▼
   Validate registration secret against ADMIN_REGISTRATION_SECRET env var
         │
         ├── Match: Create Supabase auth user
         │          │
         │          ▼
         │    If first admin: Prompt to configure initial settings
         │          │
         │          ▼
         │    Redirect to /admin/dashboard
         │
         └── No Match: Reject registration with error message
   ```

4. **On Successful Registration**
   - User account created in Supabase Auth
   - If first admin: prompted to set up city settings
   - User can now log in at `/login`
   - Full access to `/admin/*` dashboard

### Implementation Notes

The registration API endpoint should:

```typescript
// Pseudocode for admin registration validation
const registrationSecret = process.env.ADMIN_REGISTRATION_SECRET

if (submittedSecret !== registrationSecret) {
  return { error: 'Invalid registration secret' }
}

// Create Supabase user...

// Check if this is the first admin (no settings exist)
const { data: settings } = await supabase
  .from('app_settings')
  .select('id')
  .single()

if (!settings) {
  // First admin - create default settings
  await supabase.from('app_settings').insert({
    city_name: 'Cafe Cursor',
    timezone: 'America/Toronto',
  })
  
  // Redirect to settings page for initial setup
  return { redirect: '/admin/settings?setup=true' }
}

// Existing settings - redirect to dashboard
return { redirect: '/admin/dashboard' }
```

### Sharing the Registration Secret

- Share the secret **verbally** or via **secure messaging** (Signal, encrypted email)
- Never share via public channels, Slack, or unencrypted email
- Consider rotating the secret after initial admin setup

---

## Permissions Model

The application uses a simple two-tier access model:

### Public Users (Unauthenticated)

| Access | Description |
|--------|-------------|
| `/` | Home page |
| `/register` | Event registration form |
| `/login` | Admin login page |

Public users can:
- View the registration page
- Submit their registration to attend events
- Nothing else

### Admins (Authenticated)

| Access | Description |
|--------|-------------|
| `/admin/dashboard` | Overview and statistics |
| `/admin/attendees` | Manage all attendees |
| `/admin/coupons` | Manage coupon codes |
| `/admin/settings` | Configure city settings |
| All API routes | Full data access |

Admins can:
- View all registered attendees
- Manage coupon code inventory
- Assign coupons to attendees
- Send coupon emails
- Sync events/guests from Luma
- Configure city settings
- Export data

### Middleware Protection

The existing middleware (`src/middleware.ts`) handles route protection:
- `/admin/*` routes redirect to `/login` if not authenticated
- Authenticated users on `/login` redirect to `/admin/dashboard`

---

## Luma Integration Setup

Each city deployment connects to its own Luma calendar for event synchronization.

### Prerequisites

1. **Luma Plus Subscription** - Required for API access
2. **Luma Calendar** - Create a calendar for your city's events
3. **API Key** - Generated from Luma settings

### Configuration Steps

1. **Set Environment Variables**
   ```env
   LUMA_API_KEY=your_api_key_here
   LUMA_API_BASE_URL=https://public-api.luma.com
   LUMA_CALENDAR_ID=cal-your-calendar-id
   ```

2. **Test Connection**
   ```bash
   curl -H "x-luma-api-key: $LUMA_API_KEY" \
     https://public-api.luma.com/v1/user/get-self
   ```

3. **Verify Calendar Access**
   ```bash
   curl -H "x-luma-api-key: $LUMA_API_KEY" \
     "https://public-api.luma.com/v1/calendar/list-events?calendar_api_id=$LUMA_CALENDAR_ID"
   ```

### How Sync Works

1. Admin triggers sync from dashboard
2. App fetches events from the configured `LUMA_CALENDAR_ID`
3. Guest data is imported to local database
4. Coupons can be auto-assigned to confirmed guests (if enabled in settings)
5. Email notifications sent via Resend (if enabled in settings)

For detailed API information, see [LUMA_INTEGRATION_SPEC.md](./LUMA_INTEGRATION_SPEC.md).

---

## Deployment Checklist for New City

Follow these steps to deploy a new city instance:

### 1. Infrastructure Setup

- [ ] Clone the repository
- [ ] Create a new Supabase project at [supabase.com](https://supabase.com)
- [ ] Create a Vercel project (or other hosting) at [vercel.com](https://vercel.com)

### 2. Database Setup

- [ ] Run `supabase-schema.sql` in Supabase SQL Editor
- [ ] Run `supabase-schema-luma.sql` for Luma integration tables
- [ ] Run `supabase-schema-settings.sql` for app settings table
- [ ] Verify tables created: `attendees`, `coupon_codes`, `luma_events`, `luma_guests`, `app_settings`

### 3. Environment Configuration

- [ ] Copy `env.example` to `.env.local` for local development
- [ ] Fill in all Supabase credentials
- [ ] Add Resend API key
- [ ] Add Luma API key and calendar ID
- [ ] Create and set `ADMIN_REGISTRATION_SECRET`

### 4. Hosting Configuration

- [ ] Add all environment variables to Vercel/hosting provider
- [ ] Set production `NEXT_PUBLIC_APP_URL`
- [ ] Configure custom domain (optional)

### 5. Admin Setup

- [ ] Share `ADMIN_REGISTRATION_SECRET` with city organizers (securely!)
- [ ] First admin registers
- [ ] First admin configures city settings (name, timezone, etc.)
- [ ] Verify admin can access `/admin/dashboard`
- [ ] Test Luma connection from admin panel

### 6. Verification

- [ ] Test public registration flow
- [ ] Test admin login/logout
- [ ] Test settings page
- [ ] Test Luma event sync
- [ ] Test coupon assignment
- [ ] Test email sending

### 7. Post-Setup

- [ ] Consider rotating `ADMIN_REGISTRATION_SECRET`
- [ ] Fine-tune settings (messages, feature flags)
- [ ] Set up monitoring/alerts (optional)

---

## Security Best Practices

### Environment Variables

| Practice | Details |
|----------|---------|
| Never commit secrets | `.env.local` is in `.gitignore` - keep it that way |
| Use hosting provider's env settings | Vercel, Netlify, etc. encrypt env vars at rest |
| Separate dev/prod credentials | Use different API keys for development |
| Rotate secrets periodically | Especially `ADMIN_REGISTRATION_SECRET` |

### API Key Access

```typescript
// CORRECT: Server-side only (API routes, server components)
const lumaKey = process.env.LUMA_API_KEY

// WRONG: Never prefix sensitive keys with NEXT_PUBLIC_
const lumaKey = process.env.NEXT_PUBLIC_LUMA_API_KEY // DON'T DO THIS
```

### Admin Registration

- Rotate `ADMIN_REGISTRATION_SECRET` after all initial admins are registered
- Use a strong, unique phrase (not easily guessable)
- Keep a secure record of who has admin access

### Database Security

- Row Level Security (RLS) is enabled on all tables
- `app_settings` is readable by public (for display) but only editable by admins
- Public users cannot directly query attendee/coupon data
- Admin operations use `createAdminClient()` which bypasses RLS with the service role key

---

## Troubleshooting

### Common Issues

#### "Invalid registration secret"
- Double-check the secret matches exactly (case-sensitive)
- Verify `ADMIN_REGISTRATION_SECRET` is set in environment
- Restart the dev server after changing env vars

#### "Luma API connection failed"
- Verify `LUMA_API_KEY` is correct
- Check if Luma Plus subscription is active
- Test with curl command from terminal

#### "No events showing from Luma"
- Verify `LUMA_CALENDAR_ID` matches your calendar
- Check if calendar has any events
- Look for errors in server logs

#### "Emails not sending"
- Verify `RESEND_API_KEY` is correct
- Check Resend dashboard for failed deliveries
- Verify sender domain is configured in Resend

#### "Settings not saving"
- Check browser console for errors
- Verify user is authenticated
- Check RLS policies on `app_settings` table

### Getting Help

1. Check server logs for detailed error messages
2. Review [LUMA_INTEGRATION_SPEC.md](./LUMA_INTEGRATION_SPEC.md) for API details
3. Consult [CLAUDE.md](../.claude/CLAUDE.md) for codebase patterns

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-06 | Initial document - Admin onboarding setup guide |
| 1.1 | 2024-12-06 | Added app_settings database table for non-sensitive configuration |

---

**End of Document**
