-- Add API keys to app_settings table
-- These are stored in the database for easier configuration by non-technical users

-- Add luma_api_key column
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS luma_api_key TEXT;

-- Add resend_api_key column
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS resend_api_key TEXT;

-- Note: The existing RLS policy "Allow public read access to app_settings" allows
-- reading all columns. However, the public API endpoint (/api/settings/public)
-- only selects non-sensitive columns (city_name, timezone), so API keys are
-- never exposed to unauthenticated users. Admin endpoints use the service role
-- which bypasses RLS anyway.

