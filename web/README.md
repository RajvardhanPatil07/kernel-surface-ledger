# Kernel Surface Ledger — direct-use dashboard

The web dashboard for [kernel-surface-ledger](https://github.com/RajvardhanPatil07/kernel-surface-ledger):
`ksl` treats Linux kernel attack surface as an accountability problem. This app
renders a scan's `report.json` — who holds dangerous kernel surface open,
what nothing uses (free hardening), and the breakage-costed hardening plan —
with a direct, no-account ask-the-report AI panel backed by OpenRouter.

## Stack

TanStack Start (SSR on Vercel Functions) · React 19 · Tailwind v4 ·
OpenRouter (server-side only).

## Local development

```bash
npm install --legacy-peer-deps
npm run dev          # http://localhost:8080
```

Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` for live narration
and Q&A. Without it, the demo dashboard still renders from the bundled fixture.

## Deploying to Vercel

See **[docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)** — repo import, the one
environment variable, and post-deploy checks.

## Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | dev server on :8080 |
| `npm run build` | production build (nitro emits the Vercel Build Output API when `VERCEL=1`) |
| `npm run preview` | preview the production build locally |
| `npm run lint` | eslint |
| `npm run test:e2e` | e2e suite (`bun scripts/e2e-suite.ts`) |
