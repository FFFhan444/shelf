---
name: verify
description: Build, launch, and drive the shelf web app to verify changes at the UI surface.
---

# Verifying shelf changes

## Build + launch

```bash
npm run build          # must pass clean first
npm run dev            # Vite on http://localhost:5173/ (takes ~5s to be ready)
```

## Drive it

Playwright works headless; Chromium is already cached in `~/Library/Caches/ms-playwright`. Install `playwright` into a scratch dir (not the repo) and drive `http://localhost:5173/` at a 390x844 viewport (the app is mobile-first).

Useful selectors:
- List rows: `main .divide-y > div`; tap the row's first `p` to avoid inner buttons.
- Detail view overlay: `div.fixed.inset-0.bg-black`; back button `button[title="Back"]`.
- Genre pills in detail view: `.flex-wrap button`, selected = class `bg-brand-600`.
- Grid tiles: `main .grid > div` (switch views via the floating toggle bottom-right).

## Gotchas

- **This is the live Supabase DB** — the deployed app shares it. Any toggle/edit you make persists. Always revert mutations (toggle twice, or re-edit back) before finishing.
- `/api/spotify` does not exist under `vite dev` (it's a Vercel serverless function), so the console fills with pre-existing "Spotify lookup failed ... not valid JSON" errors and 404/503s. Ignore them; don't count them as regressions.
- Background backfills (Spotify URL/rescore, genre) fire on every load and hit external APIs — they add console noise and MusicBrainz-rate-limited delays but don't block UI checks.
