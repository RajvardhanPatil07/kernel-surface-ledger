# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TanStack Start + React + TypeScript + Tailwind, deployed as a direct-use Vercel application. The dashboard renders a local `report.json`; its optional server-side OpenRouter call powers live narration and Q&A. It has no account, database, or stored scan history.

## Users

Primary: Linux system administrators and security engineers assessing a real host's kernel attack surface.
Secondary: technically curious readers who want a clear, evidence-backed walkthrough without prior kernel-security knowledge.

## Product Purpose

`ksl` treats Linux kernel attack surface as an accountability problem. The dashboard renders one deterministic report: which live workloads hold which dangerous kernel surface open (attribution), what is reachable by any local user yet used by nothing (orphaned surface = free hardening), and the minimal ranked plan that kills the most CVE mass per unit of breakage risk. Success for this release: a first-time visitor understands "who is responsible" within 60 seconds and leaves trusting the numbers.

## Positioning

Every existing tool tells you *what* kernel surface is exposed — per-application (seccomp generators) or whole-kernel aggregate (hardening checkers). None attributes *shared* surface across concurrently running workloads, computes host-wide orphaned surface, or produces a breakage-costed counterfactual plan. That three-way intersection is the claim a neighboring product cannot truthfully copy.

## Operating Context

Readers can open the Vercel URL or clone the repository and run the deterministic pipeline against bundled fixtures; drag-and-drop accepts any `report.json`. Terminal/hostile-environment reading conditions are normal (dark rooms, projectors). All scored output is deterministic; the model layer only narrates and never influences scores.

## Capabilities and Constraints

- Renders the frozen `report.schema.json` contract; TS types are generated from it (schema is single source of truth).
- Must render the bundled demo fixture with zero required network calls; the file picker and drag-and-drop accept any schema-valid report.
- Drag-and-drop + file-picker ingestion of arbitrary schema-valid reports must never show a broken state.
- Determinism is part of the product story: identical reports render identically.
- No account, cookies, analytics, database, or stored user reports. The only optional server operation is a same-origin model request whose key remains on Vercel.

## Brand Commitments

Pinned visual world (docs/TASKS.md): dark terminal aesthetic — JetBrains Mono, near-black oklch surfaces, amber as the single verdict accent (cyan reserved semantically for the orphaned-surface state, red for errors). Name: Kernel Surface Ledger (`ksl`). Voice: precise, honest about uncertainty, zero marketing fluff; the tool's own copy style ("touched by nothing — free to remove") is the register.

## Evidence on Hand

- `fixtures/demo.json`: full schema-valid demo report (5 workloads, 22 elements, 5-step plan) — the reproducible rendered default, from a synthetic host.
- `fixtures/raw-demo.json`: the evidence snapshot behind it, committed for provenance.
- `data/reports/report.json`: a separately committed scheduled Linux-runner scan, retained as real-host evidence rather than silently mixed into the demo.

## Product Principles

1. **The number leads.** Every view exists to make one honest figure undeniable (reachable weight, debt, CVEs killed).
2. **Attribution over inventory.** Show who holds surface, not just that it exists.
3. **Reversibility shown, always.** Every recommendation ships its revert next to it.
4. **Determinism visible.** The UI never fakes motion in scored fields; animations clarify, never alter.
5. **Degrade like the collector.** Missing data shows its reason; nothing renders as broken.

## Accessibility & Inclusion

Keyboard-operable tables and expandable rows; visible focus; contrast-safe amber on near-black (WCAG AA for text); `aria-sort` on sortable columns; motion respects reduced-motion preference.
