# Vercel + Supabase deployment

The web app now builds as a standalone Vite frontend from `web/` and uses a Vercel serverless function at `/api/ai/ask` for the protected report-narration endpoint.

## Vercel project settings

The root `vercel.json` already sets:

- install command: `cd web && npm install`
- build command: `cd web && npm run build`
- output directory: `web/dist`
- framework: Vite

No Lovable runtime or Lovable environment is required.

## Environment variables

Set these in Vercel for Preview and Production as needed:

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable/anon client key
- `SUPABASE_URL` — server-side Supabase URL
- `SUPABASE_PUBLISHABLE_KEY` — server-side publishable/anon key used to validate user sessions
- `OPENROUTER_API_KEY` — server-only OpenRouter key for `/api/ai/ask`

Never put a Supabase service-role key or OpenRouter key in a `VITE_*` variable.

## Supabase setup

1. Create or select the Supabase project.
2. Enable email/password authentication under Authentication → Providers.
3. Add the deployed Vercel origin to Authentication → URL Configuration.
4. Apply the SQL migrations from the source application's `supabase/migrations/` directory if scan persistence is enabled in the UI.
5. Use the browser client only with the publishable key; keep privileged database operations server-side.

## Local verification

From the repository root:

```bash
cd web
npm install
npm run build
```

For local development:

```bash
npm run dev
```

The report dashboard works without Supabase because the bundled demo report is local. Supabase is required for authenticated features, and `OPENROUTER_API_KEY` is required for the AI narration endpoint.
