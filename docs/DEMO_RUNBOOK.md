# Demo runbook

Rehearse this; never improvise it. Every moving part has a fallback.
The demo must survive: no network, no API key, no root, a hostile
projector, and a judge who asks "does it scale".

## The 60-second path (works fully offline)

```bash
git clone https://github.com/RajvardhanPatil07/kernel-surface-ledger
cd kernel-surface-ledger
python3 -m venv .venv && .venv/bin/pip install jsonschema PyYAML
.venv/bin/python ksl.py scan --raw fixtures/raw-demo.json -o report.json
open report.json   # or drop it onto the dashboard
```

No network calls, no API key: LLM narration replays from the committed
cache in `explain/cache/`; without the cache the deterministic templates
fill the narrative fields silently and **every number stays identical**.

Narration order (matches the dashboard's top-to-bottom story):

1. **Hero** — "14 reachable CVEs on a real Ubuntu runner; the plan takes
   it to 6. The arrow is the whole pitch."
2. **Ledger** — "Every row is a live workload. Debt = what it owns
   outright plus its share of shared surface. The amber row at the
   bottom is surface touched by *nothing* — free to remove."
3. **Sankey** — "Workload → element → CVE cluster. Hover isolates one
   workload's blame paths."
4. **Plan** — "Three to five steps, each with a breakage prediction, a
   detection command, and a revert command. Generated for review, never
   applied."

## Fallback matrix

| Failure | Symptom | Fallback |
| --- | --- | --- |
| Venue network down | Pages URL won't load | Local path above; or `python3 -m http.server -d web/dist` and open `localhost:8000` |
| Pages URL slow | Spinner | Already loaded demo fixture renders with zero network; keep tab pre-opened |
| No API key | (nothing — cache replays) | If cache is also gone: explanations fall back to templates; numbers identical. Say: "the LLM narrates; it never computes" |
| Asked to scan live on macOS | Mostly-empty report | That *is* the demo: `meta.skipped` lists every source with a reason. "It degrades honestly, never crashes." |
| Asked to scan live on Linux w/o root | Partial report | Same answer; run it, show `skipped` entries and the report still validates |
| Judge drops a random JSON | Inline error message | Expected behaviour: "does not match the report contract" — never a blank page |
| Projector washes out dark UI | Low contrast | Cmd+ / Ctrl++ to 125–150%; amber-on-near-black is WCAG AA at text sizes |

## Q&A crib sheet

- **"500 servers?"** — Each host emits one schema-valid `report.json`;
  aggregation is a reduce over documents (sum weights, union CVE sets,
  merge ledgers by workload id). Determinism makes cross-host numbers
  comparable. Fleet views are deferred rendering, not missing
  architecture. (README: "From one host to a fleet".)
- **"Does the LLM decide anything?"** — No. `--no-explain` skips every
  call and the numeric output is byte-identical; a test asserts it. The
  LLM writes four prose fields and may re-render artifact text.
- **"Where do the weights come from?"** — `data/weights.yaml`, curated
  by hand from KSPP settings, the kernel.org CVE feed, and public LPE
  writeups; every weight carries a justification note. The code never
  generates them.
- **"Isn't 'orphaned' dangerous to auto-remove?"** — Nothing is ever
  applied. Tracing has a finite window (same limitation as the
  debloating literature), which is exactly why every step ships a
  detection command and a revert, and why syscalls are excluded from
  the orphaned set when no tracer ran.
- **"Why not just run kernel-hardening-checker?"** — It answers "what
  is exposed"; ksl answers "who is responsible, what does removal cost,
  what is the cheapest way out". Per-app tools (Confine, Chestnut) see
  one container; aggregate tools see one number. Neither attributes
  shared surface across concurrent workloads.
- **"Read-only claim?"** — Collector opens `/proc`, `/sys`,
  `/boot` read-only, never loads/unloads a module, never sets a sysctl,
  writes only its output path. Hardening artifacts are generated text
  for human review.

## Optional: a second real host in 10 minutes (GCP)

```bash
gcloud compute instances create ksl-demo --zone=europe-west1-b \
  --machine-type=e2-medium --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud
gcloud compute ssh ksl-demo --zone=europe-west1-b -- \
  'sudo apt-get -y update && sudo apt-get -y install python3-yaml python3-jsonschema \
   && git clone https://github.com/RajvardhanPatil07/kernel-surface-ledger \
   && cd kernel-surface-ledger \
   && sudo env PATH=$PATH python3 ksl.py scan -o /tmp/report.json --save-raw /tmp/raw.json'
gcloud compute scp ksl-demo:/tmp/report.json . --zone=europe-west1-b
```

Drop `report.json` onto the dashboard. A root run on a fresh VM shows
the full evidence set (kconfig, modules.dep, sysctls, lockdown). Delete
the instance after: `gcloud compute instances delete ksl-demo --zone=europe-west1-b`.

## Before you walk in

- [ ] Tab pre-opened on the live dashboard AND the offline clone ready
- [ ] `report.json` from the runner scan on the desktop, ready to drag
- [ ] One garbage `.json` file ready to demonstrate graceful rejection
- [ ] Browser zoom rehearsed for the projector
