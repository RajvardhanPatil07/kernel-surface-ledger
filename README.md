<div align="center">

# Kernel Surface Ledger

### `ksl` — understand who holds your kernel attack surface open

**A read-only Linux analyzer that turns kernel exposure into a clear, reversible hardening decision.**

[![Live dashboard](https://img.shields.io/badge/live%20dashboard-Vercel-0f172a?style=flat-square&logo=vercel&logoColor=white)](https://kernel-surface-ledger.vercel.app/)
[![Read-only collector](https://img.shields.io/badge/collector-read--only-0f766e?style=flat-square&logo=linux&logoColor=white)](#designed-for-cautious-use)
[![Deterministic scoring](https://img.shields.io/badge/scoring-deterministic-d97706?style=flat-square)](#the-ai-boundary)
[![MIT License](https://img.shields.io/badge/license-MIT-2563eb?style=flat-square)](LICENSE)

[Explore the dashboard](https://kernel-surface-ledger.vercel.app/) &nbsp;·&nbsp; [Read the method](docs/PRIOR_ART.md) &nbsp;·&nbsp; [Run a demo](#get-started) &nbsp;·&nbsp; [Deploy your own](docs/DEPLOY_VERCEL.md)

</div>

> **A kernel hardening report should end in a decision—not a longer checklist.**

Most kernel hardening tools identify settings and possible weaknesses. `ksl` takes the next step: it shows **which live workloads keep reachable kernel surface open**, **what is reachable but has no observed user**, and **which reversible changes remove the most risk for the least expected disruption**.

## From exposure to a decision

| Observe | Attribute | Act |
| --- | --- | --- |
| Read kernel configuration, modules, processes, device nodes, sysctls, and optional syscall traces—without modifying the host. | Separate surface that is merely present from surface reachable by unprivileged users, then divide responsibility across the workloads that use it. | Find orphaned surface and rank reviewable mitigations with their artifact, risk, verification command, and revert. |

The result is a **Surface Debt Ledger**: a compact explanation of who owns the exposure, what is shared, what has no observed owner, and what to change first.

## See the model work

The dashboard opens with a reproducible, schema-valid demo report. It is deliberately separate from the committed Linux-runner scan, so each visitor can distinguish repeatable walkthrough data from recorded host evidence.

| Bundled demo · [`fixtures/demo.json`](fixtures/demo.json) | Result |
| --- | --- |
| Reachable surface weight | **106.0 → 43.5** after the ranked plan |
| Reachable CVEs | **19 → 9** |
| Orphaned surface | **52.0** weighted units · **7** neutralizable CVEs |
| Report scope | 5 workloads · 22 surface elements · 5 plan steps |

The scheduled Linux-runner snapshot, [`data/reports/report.json`](data/reports/report.json), currently records **61.5** reachable weighted units, **14 → 6** reachable CVEs, and **28.0** orphaned weighted units.

## Built to be checked

| Property | Where to verify it |
| --- | --- |
| The report has a stable shape | [`report.schema.json`](report.schema.json) is the frozen contract; [`scripts/check_contract.py`](scripts/check_contract.py) validates it. |
| Scores are reproducible | [`tests/test_report.py`](tests/test_report.py) asserts byte-identical reports from the same raw snapshot. |
| AI cannot change security numbers | [`tests/test_explain.py`](tests/test_explain.py) verifies identical numeric output with and without narration. |
| Collection is safe to run | [`collector/`](collector) only reads host interfaces and records inaccessible sources in `meta.skipped`. |
| Recommendations are actionable | Every plan step includes an artifact, breakage context, detection command, and revert. |
| The product is immediately usable | The [live dashboard](https://kernel-surface-ledger.vercel.app/) works directly—no account, database, or sign-in required. |

## What sets `ksl` apart

| Existing approach | Strength | What `ksl` adds |
| --- | --- | --- |
| Kernel configuration checkers | Find deviations from recommended settings | Runtime reachability, workload ownership, and a ranked action plan |
| Per-application seccomp generators | Reduce one process or container’s syscall surface | A host-wide view of shared surface and the workloads with marginal responsibility |
| Kernel debloating systems | Produce tailored kernels | Live, read-only assessment without rebuilding or altering the kernel |

The contribution is the combination of **workload attribution**, **orphaned-surface detection**, and **breakage-costed counterfactual planning**. Read the full sourced comparison in [`docs/PRIOR_ART.md`](docs/PRIOR_ART.md).

## The AI boundary

The deterministic engine owns every score, gate, weight, CVE count, orphan classification, and plan order. Human-curated inputs live in [`data/weights.yaml`](data/weights.yaml) and [`data/cve-map.json`](data/cve-map.json); the code does not invent them.

The optional model layer can:

- explain why a workload holds a surface element;
- predict possible breakage and detection steps; and
- render reviewable hardening artifacts.

It cannot select a mitigation, modify a score, or change ordering. Running `--no-explain` keeps all numeric results identical. The hosted dashboard also offers direct report Q&A, grounded only in the report currently loaded in the browser; its model key stays server-side.

## Get started

### Reproduce the deterministic demo

```bash
git clone https://github.com/RajvardhanPatil07/kernel-surface-ledger.git
cd kernel-surface-ledger

python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

# Score the committed evidence snapshot—no host access or API key required.
python ksl.py scan --raw fixtures/raw-demo.json --no-explain -o report.json
python ksl.py check report.json

# Run the deterministic engine and collector test suite.
python -m unittest discover -s tests -v
```

### Scan a Linux host

```bash
# Read-only collection. Save the raw evidence as well as the scored report.
python ksl.py scan --save-raw raw.json -o report.json
python ksl.py check report.json
```

Drag `report.json` onto the [live dashboard](https://kernel-surface-ledger.vercel.app/) or run it locally:

```bash
cd web
npm install --legacy-peer-deps
npm run dev
```

The dashboard runs without a login. Set `OPENROUTER_API_KEY` in `web/.env` only for live Q&A and fresh narration; all deterministic report views work without it.

## Designed for cautious use

- **Read-only by design.** The collector never loads or unloads modules, changes a sysctl, or applies generated artifacts.
- **Evidence has a time window.** “Used” means observed during the selected trace window. A quiet nightly job can look unused at noon, so every recommendation includes verification and rollback guidance.
- **Missing access is reported.** Reads of `/proc`, `/sys`, and `/boot` degrade into partial evidence with a reason in `meta.skipped`; an unprivileged run remains useful instead of crashing.
- **No tracer is not false certainty.** When syscall tracing is unavailable, syscall surface is not called orphaned merely because no usage was observed.
- **Artifacts are for human review.** `ksl` produces candidate hardening files and commands; an operator decides whether to apply them.

## Explore the repository

| Path | Purpose |
| --- | --- |
| [`collector/`](collector) | Read-only Linux evidence collection: configuration, modules, processes, device nodes, sysctls, and syscall-trace adapters. |
| [`engine/`](engine) | Deterministic reachability, attribution, CVE accounting, and greedy set-cover planning. |
| [`artifacts/`](artifacts) | Deterministic templates for reviewable hardening artifacts. |
| [`explain/`](explain) | Optional constrained narration with cache and deterministic fallback. |
| [`web/`](web) | Direct-use TanStack Start dashboard deployed on Vercel. |
| [`fixtures/`](fixtures) | Reproducible raw and scored demo evidence. |
| [`tests/`](tests) | Contract, determinism, CLI, reachability, attribution, planner, and degradation tests. |
| [`scripts/fleet_rollup.py`](scripts/fleet_rollup.py) | Schema-preserving aggregation of multiple host reports. |

## A good first tour

1. Open the [dashboard](https://kernel-surface-ledger.vercel.app/).
2. Expand a ledger workload to see exactly what holds surface open.
3. Compare **Orphaned surface** with the **Hardening plan**; each plan card keeps risk, verification, and rollback in one place.
4. Drop your own schema-valid `report.json` to replace the bundled evidence.
5. Read [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md) for a concise walkthrough or [`docs/PRIOR_ART.md`](docs/PRIOR_ART.md) for the technical context.

## License

MIT. See [`LICENSE`](LICENSE).
