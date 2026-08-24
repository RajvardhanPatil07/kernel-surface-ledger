# Kernel Surface Ledger — judge-facing dashboard

The web dashboard for [kernel-surface-ledger](https://github.com/RajvardhanPatil07/kernel-surface-ledger):
`ksl` treats Linux kernel attack surface as an accountability problem. This app
renders a scan's `report.json` — who holds dangerous kernel surface open,
what nothing uses (free hardening), and the breakage-costed hardening plan —
with accounts, saved scan history, scan comparison, and an ask-the-report AI
panel backed by OpenRouter.

## Stack

TanStack Start (SSR on Vercel Functions) · React 19 · Tailwind v4 ·
Supabase (auth + Postgres + RLS) · OpenRouter (server-side only).

## Local development

```bash
npm install --legacy-peer-deps
npm run dev          # http://localhost:8080
```

Copy `.env.example` to `.env` and fill in your Supabase project values
(URL + publishable key, with and without the `VITE_` prefix) and, for the
Ask panel, `OPENROUTER_API_KEY`. Without them the demo dashboard still
renders from the bundled fixture.

## Deploying to Vercel

See **[docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)** — repo import, every
environment variable, the Supabase auth-redirect setup, and post-deploy
checks.

## Supabase setup

Run the migration in `supabase/migrations/` against your project (SQL editor
or `supabase db push`). It creates:

- `scans` — one row per saved scan (report JSONB + extracted headline figures), RLS: owner-only
- `ai_notes` — per-element AI narration cache, RLS: owner-only

Enable the Google provider in **Authentication → Providers** and add your
deployed URLs (and `http://localhost:8080`) under **Authentication → URL
Configuration → Redirect URLs**.

## Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | dev server on :8080 |
| `npm run build` | production build (nitro emits the Vercel Build Output API when `VERCEL=1`) |
| `npm run preview` | preview the production build locally |
| `npm run lint` | eslint |
| `npm run test:e2e` | e2e suite (`bun scripts/e2e-suite.ts`) |
