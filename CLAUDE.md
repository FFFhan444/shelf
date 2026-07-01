# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite, localhost:5173)
npm run build     # production build → dist/
npm run preview   # preview production build locally
```

No test suite. No linter configured.

## Architecture

Single-page React app (Vite) deployed on Vercel, with one serverless function and Supabase as the database.

**`src/App.jsx`** — the entire frontend. No routing, no component files; everything is in one file. Contains:
- `fromDb` / `toDb` helpers that translate between Supabase snake_case rows and camelCase frontend objects
- All state management via `useState` / `useEffect` / `useRef`
- Three item types: `album`, `artist`, `mix` — all stored in a single `items` table

**`api/spotify.js`** — Vercel serverless function. Keeps `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` server-side. Handles token caching, fuzzy scoring of candidates (`scoreAlbum` / `scoreArtist`), and returns the best-matching Spotify URL and artwork image. `MIN_SCORE = 40` guards against false matches.

**`src/supabaseClient.js`** — initialises the Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Data flow

Items load from Supabase on mount, sorted unlistened-first then oldest-added-first. All mutations (add, delete, toggle listened/starred, reorder) write to Supabase immediately and update local state optimistically.

Artwork fetch order for albums: Spotify → Cover Art Archive → iTunes → Bandcamp.
Artwork fetch order for artists: Spotify → TheAudioDB → MusicBrainz → Wikidata → Wikimedia Commons.

Two one-shot background effects run after initial load (gated by `useRef` + `localStorage` flags):
- **Spotify URL backfill** — fetches URLs for items that don't have one yet
- **Spotify rescore** (`spotifyRescoreDone_v2`) — re-queries existing URLs against the scored endpoint; clears wrong matches rather than keeping them

## Environment variables

`.env` for local dev:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SPOTIFY_CLIENT_ID=      # server-side only, no VITE_ prefix
SPOTIFY_CLIENT_SECRET=  # server-side only, no VITE_ prefix
```

Spotify credentials must also be set in Vercel environment variables — they are not exposed to the browser.

## Supabase

Table: `public.items`. If access fails after creating a new Supabase project, run `supabase-grants.sql` in the SQL editor to grant `anon` and `authenticated` roles access to the table.

## Tailwind

Uses Tailwind **v3** with `@tailwind` directives in `src/index.css` — not the v4 CSS-first `@theme` approach.
