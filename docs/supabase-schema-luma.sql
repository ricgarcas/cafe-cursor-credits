-- ============================================
-- Luma Integration Schema
-- Run this in your Supabase SQL Editor AFTER the base schema
-- Version: 1.0
-- Date: 2024-12-06
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
-- These columns link existing attendees to Luma guests for tracking
ALTER TABLE public.attendees 
  ADD COLUMN IF NOT EXISTS luma_guest_id TEXT REFERENCES public.luma_guests(luma_guest_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS luma_event_id TEXT REFERENCES public.luma_events(luma_event_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'luma', 'website'));

-- ============================================
-- Indexes for Performance
-- ============================================

-- luma_events indexes
CREATE INDEX IF NOT EXISTS idx_luma_events_luma_event_id ON public.luma_events(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_events_start_at ON public.luma_events(start_at);
CREATE INDEX IF NOT EXISTS idx_luma_events_is_sync_enabled ON public.luma_events(is_sync_enabled);

-- luma_guests indexes
CREATE INDEX IF NOT EXISTS idx_luma_guests_luma_guest_id ON public.luma_guests(luma_guest_id);
CREATE INDEX IF NOT EXISTS idx_luma_guests_luma_event_id ON public.luma_guests(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_guests_email ON public.luma_guests(email);
CREATE INDEX IF NOT EXISTS idx_luma_guests_registration_status ON public.luma_guests(registration_status);

-- attendees new column indexes
CREATE INDEX IF NOT EXISTS idx_attendees_luma_guest_id ON public.attendees(luma_guest_id);
CREATE INDEX IF NOT EXISTS idx_attendees_luma_event_id ON public.attendees(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_attendees_source ON public.attendees(source);

-- ============================================
-- Row Level Security
-- ============================================

-- Enable RLS on new tables
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

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Note: These rely on the handle_updated_at() function from the base schema
CREATE TRIGGER set_luma_events_updated_at
  BEFORE UPDATE ON public.luma_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_luma_guests_updated_at
  BEFORE UPDATE ON public.luma_guests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Sync Logging Table (for monitoring/debugging)
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

-- Sync logs indexes
CREATE INDEX IF NOT EXISTS idx_luma_sync_logs_event_id ON public.luma_sync_logs(luma_event_id);
CREATE INDEX IF NOT EXISTS idx_luma_sync_logs_status ON public.luma_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_luma_sync_logs_created_at ON public.luma_sync_logs(created_at);

-- RLS for sync logs
ALTER TABLE public.luma_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view luma_sync_logs"
  ON public.luma_sync_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to luma_sync_logs"
  ON public.luma_sync_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- Helpful Views
-- ============================================

-- View: Events with sync status summary
CREATE OR REPLACE VIEW public.luma_events_summary AS
SELECT 
  le.id,
  le.luma_event_id,
  le.name,
  le.start_at,
  le.end_at,
  le.guest_count,
  le.is_sync_enabled,
  le.last_synced_at,
  COUNT(DISTINCT lg.id) AS synced_guest_count,
  COUNT(DISTINCT a.id) AS attendees_with_coupons,
  (
    SELECT COUNT(*) 
    FROM public.luma_sync_logs lsl 
    WHERE lsl.luma_event_id = le.luma_event_id 
    AND lsl.status = 'completed'
  ) AS successful_syncs
FROM public.luma_events le
LEFT JOIN public.luma_guests lg ON le.luma_event_id = lg.luma_event_id
LEFT JOIN public.attendees a ON lg.luma_guest_id = a.luma_guest_id AND a.coupon_code_id IS NOT NULL
GROUP BY le.id, le.luma_event_id, le.name, le.start_at, le.end_at, 
         le.guest_count, le.is_sync_enabled, le.last_synced_at;

-- Grant access to the view
GRANT SELECT ON public.luma_events_summary TO authenticated;
GRANT SELECT ON public.luma_events_summary TO service_role;

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE public.luma_events IS 'Stores events synced from Luma calendar';
COMMENT ON TABLE public.luma_guests IS 'Stores guest/attendee data from Luma events';
COMMENT ON TABLE public.luma_sync_logs IS 'Logs sync operations for monitoring and debugging';

COMMENT ON COLUMN public.luma_events.luma_event_id IS 'Unique event ID from Luma (api_id)';
COMMENT ON COLUMN public.luma_events.is_sync_enabled IS 'Whether this event should be included in automatic syncs';
COMMENT ON COLUMN public.luma_events.last_synced_at IS 'Timestamp of the last successful guest sync';

COMMENT ON COLUMN public.luma_guests.luma_guest_id IS 'Unique guest ID from Luma';
COMMENT ON COLUMN public.luma_guests.guest_key IS 'Luma guest key (starts with g-)';
COMMENT ON COLUMN public.luma_guests.registration_status IS 'Guest registration status: confirmed, waitlist, declined, cancelled';

COMMENT ON COLUMN public.attendees.luma_guest_id IS 'Reference to the Luma guest if imported from Luma';
COMMENT ON COLUMN public.attendees.luma_event_id IS 'Reference to the Luma event if imported from Luma';
COMMENT ON COLUMN public.attendees.source IS 'How the attendee was registered: manual, luma, website';
