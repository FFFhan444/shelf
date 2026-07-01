-- Shelf Supabase Grants
-- Run in the Supabase SQL Editor to ensure Data API access.
-- Run this if Data API access to public.items fails, e.g. after creating a new Supabase project.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO anon, authenticated;
