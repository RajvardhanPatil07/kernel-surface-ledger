<div align="center">

# Kernel Surface Ledger

### `ksl` — AI-assisted Linux kernel attack surface analyzer

**Turn low-level kernel exposure into an explainable, evidence-backed hardening decision.**

[![Linux](https://img.shields.io/badge/platform-Linux-111111?style=flat-square&logo=linux&logoColor=white)](#get-started)
[![Read-only](https://img.shields.io/badge/collector-read--only-111111?style=flat-square)](#designed-for-cautious-use)
[![Deterministic](https://img.shields.io/badge/security--scoring-deterministic-111111?style=flat-square)](#the-ai-boundary)
[![Live](https://img.shields.io/badge/dashboard-live-111111?style=flat-square)](https://kernel-surface-ledger.vercel.app/)
[![MIT](https://img.shields.io/badge/license-MIT-111111?style=flat-square)](LICENSE)

**Rajvardhan Patil** · AI-assisted Kernel Attack Surface Analyzer · Linux-based hackathon build

[Explore the dashboard](https://kernel-surface-ledger.vercel.app/) · [Run the demo](#reproduce-the-deterministic-demo) · [Read the method](docs/PRIOR_ART.md) · [Deploy your own](docs/DEPLOY_VERCEL.md)

</div>

> **The goal is not another kernel checklist. The goal is a defensible answer to one question: _what should we review first, and why?_**

## 01 / What it does

Kernel Surface Ledger (`ksl`) is a **read-only Linux analyzer** that collects evidence about kernel configuration, loaded modules, processes, device nodes, sysctls, and optional syscall traces. It then turns that evidence into a deterministic report covering:

- **Presence** — what kernel surface exists.
- **Reachability** — what an unprivileged local user can actually reach.
- **Attribution** — which live workloads keep that surface relevant.
- **Orphans** — reachable surface with no observed owner during the trace window.
- **Planning** — which reversible hardening steps remove the most reachable CVE mass for the least expected breakage.
- **Explanation** — optional AI narration that explains evidence without controlling security numbers.

The result is a **Surface Debt Ledger**: not a flat findings list, but an accountable model of exposure, ownership, and change.

## 02 / Why this fits the problem statement

**Problem statement:** Develop an AI-assisted tool that automatically analyzes Linux kernel configurations, loaded kernel modules, system calls, and exposed kernel interfaces to identify potential security weaknesses, assess attack surfaces, and generate explainable kernel hardening recommendations.

| Requirement | `ksl` implementation |
| --- | --- |
| Kernel configuration | `collector/kconfig.py` |
| Loaded modules | `collector/modules.py` |
| System calls | `collector/syscalls.py` with optional trace adapters |
| Kernel interfaces | device nodes, sysctls, modules, and reachability engine |
| Attack-surface assessment | `engine/reachability.py` + deterministic scoring |
| Security weaknesses | CVE mapping + reachability-aware accounting |
| Explainability | `explain/` constrained narration + grounded dashboard Q&A |
| Hardening recommendations | `engine/setcover.py` + reviewable artifacts |
| Linux compatibility | read-only Linux host collector + Linux-first fixtures |

## 03 / The differentiator

Most hardening tools stop after finding a setting or a vulnerable component. `ksl` adds three questions that make the result operational:

**Who keeps it open?** Workload attribution separates shared surface from marginal responsibility.

**Is anyone actually touching it?** Orphaned-surface analysis distinguishes reachable-but-unused surface from active dependencies.

**What should change first?** Counterfactual planning ranks reversible mitigations by security impact versus estimated disruption.

That combination makes the report easier to review with an operator, security engineer, or judge.

## 04 / AI boundary

The security engine is deliberately conservative.

**Deterministic code owns:** scores, gates, weights, CVE counts, orphan classification, and plan order.

**The model may:** explain why a workload holds a surface element, summarize observed evidence, predict possible breakage, and render reviewable hardening artifacts.

**The model may not:** change numeric scores, invent security findings, select the winning mitigation, or silently reorder the hardening plan.

The optional `--no-explain` path produces the same security numbers without AI narration, making the separation testable.

## 05 / Demo signal

The bundled dashboard opens directly on reproducible demo evidence, so a reviewer can understand the product without a Linux host, account, database, or API key.

| Demo metric | Result |
| --- | --- |
| Reachable surface | **106.0 → 43.5** after ranked plan |
| Reachable CVEs | **19 → 9** |
| Orphaned surface | **52.0** weighted units |
| Neutralizable orphan CVEs | **7** |
| Workloads | **5** |
| Surface elements | **22** |
| Hardening steps | **5** |

The dashboard also supports loading a schema-valid `report.json`, rendering the same evidence model for a real Linux host.

## 06 / Get started

### Reproduce the deterministic demo

```bash
git clone https://github.com/RajvardhanPatil07/kernel-surface-ledger.git
cd kernel-surface-ledger

python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

# Score committed evidence without touching the host.
python ksl.py scan --raw fixtures/raw-demo.json --no-explain -o report.json
python ksl.py check report.json

# Run the deterministic test suite.
python -m unittest discover -s tests -v
```

### Scan a Linux host

```bash
# Read-only host collection.
python ksl.py scan --save-raw raw.json -o report.json
python ksl.py check report.json
```

Then load `report.json` into the [live dashboard](https://kernel-surface-ledger.vercel.app/) or run the dashboard locally:

```bash
cd web
npm install --legacy-peer-deps
npm run dev
```

Set `OPENROUTER_API_KEY` in `web/.env` only when you want live Q&A or fresh narration. The deterministic report views do not require it.

## 07 / Designed for cautious use

- **Read-only by design.** The collector never loads or unloads modules, changes sysctls, or applies hardening automatically.
- **Evidence has a time window.** “Used” means observed during the selected trace period; a quiet service can look unused later.
- **Missing access is explicit.** Inaccessible sources are recorded in `meta.skipped` instead of becoming silent false certainty.
- **No tracer is not proof of absence.** Syscall surface is not called orphaned merely because a trace was unavailable.
- **Artifacts are reviewable.** Each recommendation carries its target artifact, expected breakage, detection command, and revert path.

## 08 / Repository map

| Path | Purpose |
| --- | --- |
| `collector/` | Read-only Linux evidence collection |
| `engine/` | Deterministic reachability, attribution, CVE accounting, and planning |
| `artifacts/` | Reviewable hardening artifact templates |
| `explain/` | Optional constrained AI narration |
| `web/` | TanStack Start dashboard deployed on Vercel |
| `fixtures/` | Reproducible demo evidence |
| `tests/` | Contract, determinism, CLI, reachability, attribution, planner, and degradation tests |
| `docs/` | Demo runbook, prior-art research, testing, and deployment notes |

## 09 / A good judge walkthrough

1. Open the dashboard and read the top-level exposure metrics.
2. Expand a ledger workload to see what it owns and what remains shared.
3. Compare **Orphaned surface** with the **Hardening plan**.
4. Open a plan step to inspect artifact, expected breakage, verification, and rollback.
5. Open **Impact graph** to see the blast radius before applying a change.
6. Ask the report a question and verify that the answer remains grounded in the loaded evidence.
7. Read **Where the AI is — and is not** to see the deterministic security boundary.

## 10 / License

MIT. See [LICENSE](LICENSE).
