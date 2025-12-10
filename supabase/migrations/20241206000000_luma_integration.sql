-- Luma Integration Schema
-- Tables for syncing events and guests from Luma

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

-- Indexes for Performance
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

-- Row Level Security
ALTER TABLE public.luma_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luma_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view luma_events"
  ON public.luma_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to luma_events"
  ON public.luma_events
  FOR ALL
  USING (auth.role() = 'service_role');

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

-- Sync Logging Table
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

