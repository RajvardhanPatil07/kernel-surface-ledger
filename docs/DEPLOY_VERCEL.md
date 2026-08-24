# Deploying ksl to Vercel

The app is a TanStack Start (SSR) app. It needs a server at runtime, because two
things must never reach the browser: the model API key and the service-role
database access. Vercel Functions provide that server, so the deploy is a normal
Vercel project with no extra adapter work.

## 1. Import the repo

Vercel dashboard → **Add New → Project → Import Git Repository**.

Vercel detects the build from `vercel.json`:

- Build command: `vite build`
- Install command: `npm install --legacy-peer-deps`
- Framework preset: none (do not pick "Vite" — that would publish a static
  bundle with no server)

The build emits Vercel's Build Output API v3 (`.vercel/output`) automatically:
the bundler detects the `VERCEL` environment variable and targets Vercel
instead of the default edge target. No config change is required.

## 2. Environment variables

Add these in **Project → Settings → Environment Variables** for both
_Production_ and _Preview_:

| Name                            | Value                                    | Why                                 |
| ------------------------------- | ---------------------------------------- | ----------------------------------- |
| `OPENROUTER_API_KEY`            | your OpenRouter key                      | server-only; powers narration + Ask |
| `SUPABASE_URL`                  | your project URL                         | server-side reads                   |
| `SUPABASE_PUBLISHABLE_KEY`      | publishable (anon) key                   | verifies the caller's bearer token  |
| `SUPABASE_SERVICE_ROLE_KEY`     | service-role key (only if you use admin) | privileged writes                   |
| `VITE_SUPABASE_URL`             | same as `SUPABASE_URL`                   | browser client                      |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same publishable key                     | browser client                      |
| `VITE_SUPABASE_PROJECT_ID`      | project ref                              | browser client                      |

Only the `VITE_`-prefixed values are exposed to the browser. Never prefix
`OPENROUTER_API_KEY` or the service-role key with `VITE_`.

## 3. Auth redirect URLs

In the backend's auth settings add the Vercel URLs to the allowed redirects:

- `https://<your-project>.vercel.app`
- `https://<your-project>.vercel.app/scans`
- your custom domain, if any

Without this, Google sign-in and the email confirmation link bounce back with a
redirect error.

## 4. Verify after deploy

```bash
curl -sI https://<your-project>.vercel.app/            # 200, HTML
curl -s  https://<your-project>.vercel.app/api/ai/ask -X POST   # 401 (auth required — correct)
```

Then in the browser:

1. `/` renders the bundled demo scan with no account.
2. Drag a `report.json` in — a bad file shows the classified error panel.
3. **Download hardening PDF** produces the plan report.
4. Sign in, then ask a question in **Ask this report** — the answer streams and
   the claim-audit badge appears underneath.

## Notes

- The public dashboard, PDF export, impact graph and "Check this" panel are all
  client-side, so they work even if the model provider is down.
- If the free model pool is overloaded, the server retries a fallback model and
  then a non-streaming call before it reports an error, so a transient provider
  failure no longer shows up as an empty answer.
- `npm run test:e2e` runs the deterministic suite from `docs/TESTING.md`; run it
  in CI before promoting a deployment.
