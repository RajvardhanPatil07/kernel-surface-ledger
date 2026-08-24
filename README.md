# Kernel Surface Ledger (`ksl`)

**Kernel attack-surface analysis that names the workload holding each risk open, identifies reachable surface nobody used, and produces a reversible hardening plan.**

[Open the live dashboard](https://kernel-surface-ledger.vercel.app/) · [Judge guide](docs/DEMO_RUNBOOK.md) · [Prior-art comparison](docs/PRIOR_ART.md) · [Deployment](docs/DEPLOY_VERCEL.md)

## The idea in 60 seconds

Most kernel hardening tools return a long inventory: configuration flags, loaded modules, and possible weaknesses. That is useful, but it leaves an operator with the hard question: **what is this host actually paying for, and what can be safely changed?**

`ksl` turns that inventory into a decision record:

1. It observes kernel-facing surface and live workloads with a strictly read-only collector.
2. It separates surface that is merely present from surface an unprivileged user can reach, then from surface observed in use.
3. It attributes reachable surface to the workloads that keep it open, including shared responsibility.
4. It finds *orphaned surface*: removable, unprivileged-reachable surface with no observed user during the trace window.
5. It ranks reversible mitigations by newly neutralized CVE mass versus curated breakage cost.

The result is a **Surface Debt Ledger** instead of another checklist: who owns the exposure, what is shared, what has no observed owner, and what to change first.

## What a judge can verify

| Claim | Evidence in this repository |
| --- | --- |
| A report is structurally trustworthy | [`report.schema.json`](report.schema.json) is the frozen contract; [`scripts/check_contract.py`](scripts/check_contract.py) validates it. |
| Scores are reproducible | [`tests/test_report.py`](tests/test_report.py) asserts byte-identical reports from the same raw snapshot. |
| AI cannot influence security numbers | [`tests/test_explain.py`](tests/test_explain.py) verifies the numeric output is unchanged with and without narration. |
| The collector is safe to run | [`collector/`](collector) only reads host interfaces, records inaccessible sources in `meta.skipped`, and never applies hardening. |
| The plan is actionable | Every plan step has a generated artifact, breakage note, detection command, and revert. |
| The product is usable now | The [live dashboard](https://kernel-surface-ledger.vercel.app/) works directly—no account, database, or sign-in required. |

## Evidence, not screenshots

The default dashboard uses the schema-valid bundled demo fixture so that every visitor gets the same reproducible walkthrough:

| Bundled demo (`fixtures/demo.json`) | Result |
| --- | --- |
| Reachable surface weight | **106.0 → 43.5** after the ranked plan |
| Reachable CVEs | **19 → 9** |
| Orphaned surface | **52.0** weighted units; **7** neutralizable CVEs |
| Scope | 5 workloads, 22 surface elements, 5 plan steps |

The scheduled Linux-runner scan is committed separately as [`data/reports/report.json`](data/reports/report.json), preserving a recorded real-host artifact rather than silently blending it into the demo. Its current snapshot records **61.5** reachable weighted units, **14 → 6** reachable CVEs, and **28.0** orphaned weighted units.

## Why this is different

| Approach | Useful for | What `ksl` adds |
| --- | --- | --- |
| Kernel configuration checkers | Finding deviations from recommended settings | Runtime reachability, workload ownership, and a ranked action plan |
| Per-application seccomp generators | Reducing one process or container’s syscall surface | A host-wide view of shared kernel surface and its marginal owners |
| Kernel debloating systems | Producing tailored kernels | Live, read-only assessment without rebuilding or changing the kernel |

The full, sourced comparison is in [`docs/PRIOR_ART.md`](docs/PRIOR_ART.md). The contribution is the intersection of three capabilities: **attribution**, **orphaned-surface detection**, and **breakage-costed counterfactual planning**.

## The model: useful, bounded, never in charge

The deterministic engine owns every score, gate, weight, CVE count, orphan classification, and plan order. Human-curated inputs live in [`data/weights.yaml`](data/weights.yaml) and [`data/cve-map.json`](data/cve-map.json); the code does not invent them.

The optional model layer may only:

- explain why a workload holds a surface element;
- predict possible breakage and detection steps; and
- render reviewable hardening artifacts.

It cannot select a mitigation, modify a score, or change ordering. `--no-explain` keeps the numeric result identical. The hosted dashboard also offers direct report Q&A, grounded only in the report currently loaded in the browser; its model key stays server-side.

## Quick start

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

Then drag `report.json` onto the [live dashboard](https://kernel-surface-ledger.vercel.app/) or start it locally:

```bash
cd web
npm install --legacy-peer-deps
npm run dev
```

The dashboard runs without a login. Set `OPENROUTER_API_KEY` in `web/.env` only if you want live Q&A and fresh narration; all deterministic report views work without it.

## Safety and honest limits

- **Read-only by design.** The collector never loads or unloads modules, changes a sysctl, or applies the generated artifacts.
- **Evidence has a time window.** “Used” means observed during the selected trace window. A quiet nightly job can look unused at noon, so every recommendation includes detection and revert guidance.
- **Missing access is reported.** Reads of `/proc`, `/sys`, and `/boot` degrade into partial evidence with a reason in `meta.skipped`; an unprivileged run remains useful instead of crashing.
- **No tracer is not false certainty.** When syscall tracing is unavailable, syscall surface is not labeled orphaned merely because no usage was observed.
- **Artifacts are for human review.** `ksl` produces candidate hardening files and commands; an operator decides whether to apply them.

## Repository guide

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

## Judge path

1. Open the [dashboard](https://kernel-surface-ledger.vercel.app/).
2. Start with **Ask this report**, then expand a ledger workload to see what holds the surface open.
3. Inspect **Orphaned surface** and the **Hardening plan**; each plan card makes risk, verification, and rollback visible together.
4. Drop your own schema-valid `report.json` to replace the bundled evidence.
5. Use [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md) for the 60-second narration and [`docs/PRIOR_ART.md`](docs/PRIOR_ART.md) for the novelty argument.

## License

MIT. See [`LICENSE`](LICENSE).
