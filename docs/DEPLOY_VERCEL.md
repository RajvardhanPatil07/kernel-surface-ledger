# Deploying ksl to Vercel

The app is a TanStack Start (SSR) app. It needs a server at runtime because the
model API key must never reach the browser. Vercel Functions provide that
server, so the deploy is a normal Vercel project with no extra adapter work.

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

| Name                 | Value               | Why                                 |
| -------------------- | ------------------- | ----------------------------------- |
| `OPENROUTER_API_KEY` | your OpenRouter key | server-only; powers narration + Ask |

Never prefix `OPENROUTER_API_KEY` with `VITE_`; doing so would expose it in the
browser bundle.

## 3. Verify after deploy

```bash
curl -sI https://<your-project>.vercel.app/            # 200, HTML
curl -s  https://<your-project>.vercel.app/api/ai/ask -X POST   # 400 (a request body is required)
```

Then in the browser:

1. `/` renders the bundled demo scan with no account.
2. Drag a `report.json` in — a bad file shows the classified error panel.
3. **Download hardening PDF** produces the plan report.
4. Ask a question in **Ask this report** — the answer streams and
   the claim-audit badge appears underneath.

## Notes

- The public dashboard, PDF export, impact graph and "Check this" panel are all
  client-side, so they work even if the model provider is down.
- If the free model pool is overloaded, the server retries a fallback model and
  then a non-streaming call before it reports an error, so a transient provider
  failure no longer shows up as an empty answer.
- `npm run test:e2e` runs the deterministic suite from `docs/TESTING.md`; run it
  in CI before promoting a deployment.
