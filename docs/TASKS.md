# Historical implementation plan

> All phases below are complete. This document preserves the development checklist; it is not the current product/deployment specification. For the direct-use Vercel dashboard and project overview, start with [`README.md`](../README.md) and [`docs/DEPLOY_VERCEL.md`](DEPLOY_VERCEL.md).

One task per session. Paste `report.schema.json` and `AGENTS.md` alongside each
task. Every task ends by running its own output.

| Phase | Deliverable | Depends on |
| --- | --- | --- |
| 0 | `report.schema.json`, `data/weights.yaml` frozen | - |
| 1 | `collector/` - kconfig, modules, processes, sysctl | 0 |
| 2 | `collector/syscalls.py` - per-workload syscall matrix, three backends | 0 |
| 3 | `engine/` - reachability, attribution, set cover, report | 1, 2 |
| 4 | `web/` - static dashboard | 0 |
| 5 | `artifacts/`, `explain/` | 3 |

Phase 2 is the highest-risk component: eBPF tooling is frequently unavailable or
broken on a given host. Do it early, and make sure the pipeline still produces a
useful report when tracing is unavailable (`trace_backend: "none"`, `used: false`
everywhere).

---

## Task 1 - collector

```
Build the collector package for kernel-surface-ledger. Read report.schema.json and
AGENTS.md first; your output must populate meta, surface_elements (present and
reachable_unpriv only), and workloads.

Python 3.11, stdlib only:

collector/kconfig.py   parse_kconfig() reading /proc/config.gz if present, else
                       /boot/config-$(uname -r). Return dict CONFIG_* -> y|m|n.
collector/modules.py   loaded_modules() from /proc/modules; for each read
                       /sys/module/<m>/refcnt and /sys/module/<m>/holders.
                       available_modules() by walking
                       /lib/modules/$(uname -r)/modules.dep, so "loaded" can be
                       distinguished from "loadable via autoload".
collector/processes.py enumerate /proc/[0-9]*: comm, exe, uid, systemd unit from
                       /proc/<pid>/cgroup, CapEff/CapPrm/Seccomp/NoNewPrivs from
                       /proc/<pid>/status, and every /dev/* and /proc/* path found
                       in /proc/<pid>/fd and /proc/<pid>/maps. Group PIDs by unit
                       into one workload. Skip kernel threads (no exe).
collector/sysctl.py    read the sysctls named in data/weights.yaml plus everything
                       in /sys/devices/system/cpu/vulnerabilities/,
                       /sys/kernel/security/lsm, and /proc/cmdline.
collector/collect.py   CLI: python -m collector.collect -o raw.json

Read-only. Graceful degradation with a reason recorded in meta.skipped. Must
complete as a non-root user.

Then run it as both root and non-root and show me raw.json.
```

## Task 2 - syscall matrix

```
Add collector/syscalls.py. Produce a per-PID set of syscalls actually invoked
during an N-second window.

trace_syscalls(seconds: int, backend: str = "auto") -> dict[int, set[str]]

Three backends behind that one signature:
  bcc     shell out to `syscount -P -d N -j` if available, parse it
  perf    `perf trace -s -a -- sleep N`, parse the per-process summary
  strace  `strace -f -c -p <pid>` fanned out over the top N processes by CPU

"auto" probes in that order and records the winner in meta.trace_backend. If all
three fail, return {} and set trace_backend="none" - the pipeline must still work
with used=false everywhere.

Commit captured sample output from each backend under tests/fixtures/ and write
parser unit tests that need no root.

Then run all three on this machine, tell me which work here, and paste the parsed
output for the top 5 processes.
```

## Task 3 - engine

```
Build the engine package. Input raw.json + data/weights.yaml, output report.json
validated with jsonschema against report.schema.json.

engine/reachability.py  three-tier gate per element, setting gate_reason:
  present          compiled in (=y), loaded, or loadable via modules.dep
  reachable_unpriv present AND not blocked by its sysctl gate AND not blocked by
                   lockdown/LSM AND (devnodes) mode grants non-root access
  used             any workload's touches or traced syscalls include it

engine/attribution.py   bipartite graph workload -> element, then:
  sole_owner_elements     touched by exactly one workload
  shared_elements         touched by two or more
  surface_debt(w)         sum(weight of sole-owner) + sum(weight / n_touchers)
  marginal_contribution(w) total_reachable_weight - total_without_w
  orphaned                present AND reachable_unpriv AND used by nobody,
                          restricted to removable kinds (syscall, module,
                          devnode, namespace, capability)
  ledger sorted by surface_debt descending

engine/setcover.py      candidates come from each element's mitigations list.
  Greedy weighted set cover maximising (new cve_clusters covered) / breakage_cost,
  where breakage_cost = 1 orphaned, 4 if any workload uses it, 12 for
  kconfig_disable. Stop at 5 steps or when no candidate covers a new cluster.
  Emit projected_after_plan by recomputing the score with planned elements removed.

engine/report.py        assemble, validate, exit non-zero on schema violation.

Determinism: sort every collection, no dict-order dependence, no randomness, no
wall-clock in scored fields. Two runs over the same raw.json must be byte-identical.
Write a test asserting that.

Then run the full pipeline and show me report.json, and run
python scripts/check_contract.py against it.
```

## Task 4 - dashboard

```
Build web/: Vite + React + TypeScript + Tailwind, static, deployable to Vercel with
no backend. Loads /fixtures/demo.json by default, plus a drag-and-drop zone that
accepts any report.json. Generate TS types from report.schema.json.

One scrolling page, dark terminal aesthetic - JetBrains Mono, near-black
background, a single amber accent.

1 HEADER      reachable_cve_count as a large figure, projected_after_plan beside it,
              animated arrow between. Kernel release and trace backend as metadata.
2 LEDGER      the hero table: workload, surface_debt bar, sole-owner count,
              reachable CVEs. Expanding a row reveals the explanation and element
              chips. Sortable. The ORPHANED row is pinned last, amber, labelled
              "touched by nothing - free to remove".
3 BLAME GRAPH Sankey, three columns workloads -> elements -> CVE clusters, link
              width by weight. Hovering a workload highlights only its paths. Write
              a small dependency-free SVG Sankey; do not pull in a chart library.
4 PLAN        ordered cards: action, targets, cves_killed, breakage_risk badge, the
              artifact in a code block with a copy button, and the revert command.

Must render from fixtures/demo.json with zero network calls. Then run npm run build
and confirm it succeeds.
```

## Task 5 - artifacts and explain layer

```
Build artifacts/ and explain/.

artifacts/*.py  deterministic template functions producing file content for each
                plan action: modprobe.d, seccomp JSON, sysctl fragment, systemd
                drop-in, udev rule. No LLM. This is the fallback path when no API
                key is present.

explain/explain.py  given report.json, call an OpenAI-compatible chat endpoint
                (KSL_API_BASE, KSL_API_KEY, KSL_MODEL) using the templates in
                explain/prompts/. Populate ledger[].explanation and
                plan[].breakage_note / detection / revert, and optionally render
                plan[].artifact.content.

Requirements:
- --explain-only=false skips all LLM calls and produces identical numeric output.
  Write a test that diffs both runs and asserts every numeric field is equal.
- Cache each response to explain/cache/<sha256 of prompt>.json and commit the cache,
  so a demo works with no network and no API key.
- On any error, timeout, or missing key: fall back to the deterministic templates,
  set explanation to "", never crash, never block the pipeline.

Then run it with and without the API key and show me the diff.
```
