-- Shelf Genres Migration
-- Run in the Supabase SQL Editor to add genre storage for the genre filter feature.

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS genres text[] DEFAULT '{}';
