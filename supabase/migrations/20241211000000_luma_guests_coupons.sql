-- Ensure luma_events table exists (idempotent)
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

-- Ensure luma_guests table exists (idempotent)
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

-- Add coupon tracking fields to luma_guests table
ALTER TABLE public.luma_guests
  ADD COLUMN IF NOT EXISTS coupon_code_id BIGINT REFERENCES public.coupon_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- Create index for coupon lookups on luma_guests
CREATE INDEX IF NOT EXISTS idx_luma_guests_coupon_code_id ON public.luma_guests(coupon_code_id);

-- Add tracking fields to coupon_codes to identify source of usage
ALTER TABLE public.coupon_codes
  ADD COLUMN IF NOT EXISTS used_by_type TEXT CHECK (used_by_type IN ('attendee', 'luma_guest')),
  ADD COLUMN IF NOT EXISTS used_by_luma_guest_id TEXT REFERENCES public.luma_guests(luma_guest_id) ON DELETE SET NULL;

-- Create index for source tracking
CREATE INDEX IF NOT EXISTS idx_coupon_codes_used_by_type ON public.coupon_codes(used_by_type);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_used_by_luma_guest_id ON public.coupon_codes(used_by_luma_guest_id);

-- Update existing used coupons that are linked to attendees
UPDATE public.coupon_codes
SET used_by_type = 'attendee'
WHERE is_used = true AND used_by_type IS NULL;

-- Ensure RLS policies exist for luma tables
ALTER TABLE public.luma_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luma_guests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'luma_events' AND policyname = 'Allow authenticated users to view luma_events') THEN
    CREATE POLICY "Allow authenticated users to view luma_events" ON public.luma_events FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'luma_events' AND policyname = 'Allow service role full access to luma_events') THEN
    CREATE POLICY "Allow service role full access to luma_events" ON public.luma_events FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'luma_guests' AND policyname = 'Allow authenticated users to view luma_guests') THEN
    CREATE POLICY "Allow authenticated users to view luma_guests" ON public.luma_guests FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'luma_guests' AND policyname = 'Allow service role full access to luma_guests') THEN
    CREATE POLICY "Allow service role full access to luma_guests" ON public.luma_guests FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Ensure luma_sync_logs table exists
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

ALTER TABLE public.luma_sync_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'luma_sync_logs' AND policyname = 'Allow authenticated users to view luma_sync_logs') THEN
    CREATE POLICY "Allow authenticated users to view luma_sync_logs" ON public.luma_sync_logs FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'luma_sync_logs' AND policyname = 'Allow service role full access to luma_sync_logs') THEN
    CREATE POLICY "Allow service role full access to luma_sync_logs" ON public.luma_sync_logs FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_luma_events_luma_event_id ON public.luma_events(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_guests_luma_guest_id ON public.luma_guests(luma_guest_id);
CREATE INDEX IF NOT EXISTS idx_luma_guests_luma_event_id ON public.luma_guests(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_guests_email ON public.luma_guests(email);
CREATE INDEX IF NOT EXISTS idx_luma_sync_logs_event_id ON public.luma_sync_logs(luma_event_id);
