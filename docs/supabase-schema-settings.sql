-- ============================================
-- App Settings Schema
-- Non-sensitive configuration stored in database
-- Run this after the base schema (supabase-schema.sql)
-- ============================================

-- Create app_settings table
-- This stores non-sensitive configuration that can be edited via admin UI
CREATE TABLE IF NOT EXISTS public.app_settings (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  -- City Information
  city_name TEXT NOT NULL DEFAULT 'Cafe Cursor',
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one settings row exists (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_singleton 
  ON public.app_settings ((true));

-- Insert default settings row
INSERT INTO public.app_settings (city_name, timezone)
VALUES ('Cafe Cursor Toronto', 'America/Toronto')
ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can read settings (needed for public pages)
CREATE POLICY "Allow public read access to app_settings"
  ON public.app_settings
  FOR SELECT
  USING (true);

-- Only authenticated users (admins) can update settings
CREATE POLICY "Allow authenticated users to update app_settings"
  ON public.app_settings
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Service role has full access
CREATE POLICY "Allow service role full access to app_settings"
  ON public.app_settings
  FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Helper function to get settings
-- ============================================

CREATE OR REPLACE FUNCTION public.get_app_settings()
RETURNS public.app_settings
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.app_settings LIMIT 1;
$$;
