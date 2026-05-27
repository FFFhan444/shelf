-- Shelf Supabase Grants
-- Run in the Supabase SQL Editor to ensure Data API access.
-- Required for new tables created after October 30, 2026.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO anon, authenticated;
