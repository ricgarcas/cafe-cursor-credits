-- Single Luma Event Mode
-- Add luma_event_id to app_settings for locking to a single event

ALTER TABLE public.app_settings 
  ADD COLUMN IF NOT EXISTS luma_event_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.app_settings.luma_event_id IS 'The Luma event ID to lock this deployment to (single event mode)';

