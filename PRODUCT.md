# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated → Vite + React + TypeScript + Tailwind, static build deployed to GitHub Pages (per docs/TASKS.md Task 4, confirmed by owner 2026-08-23). Zero backend; report.json is data, not a service.

## Users

Primary (this release): hackathon judges — security-competent but new to the project, deciding innovation/feasibility/scalability/impact within minutes, often from a shared link on a laptop.
Secondary (post-hackathon): Linux sysadmins and security engineers assessing a real host's kernel attack surface.

## Product Purpose

`ksl` treats Linux kernel attack surface as an accountability problem. The dashboard renders one deterministic report: which live workloads hold which dangerous kernel surface open (attribution), what is reachable by any local user yet used by nothing (orphaned surface = free hardening), and the minimal ranked plan that kills the most CVE mass per unit of breakage risk. Success for this release: a judge understands "who is responsible" within 60 seconds of landing and leaves trusting the numbers.

## Positioning

Every existing tool tells you *what* kernel surface is exposed — per-application (seccomp generators) or whole-kernel aggregate (hardening checkers). None attributes *shared* surface across concurrently running workloads, computes host-wide orphaned surface, or produces a breakage-costed counterfactual plan. That three-way intersection is the claim a neighboring product cannot truthfully copy.

## Operating Context

Evaluation settings: judges open a GitHub Pages URL or clone the repo and run it offline against bundled fixtures; drag-and-drop accepts any report.json. Terminal/hostile-environment reading conditions are normal (dark rooms, projectors). All scored output is deterministic; the LLM layer only narrates and never influences scores.

## Capabilities and Constraints

- Renders the frozen `report.schema.json` contract; TS types are generated from it (schema is single source of truth).
- Must render with zero required network calls (bundled demo fixture); optional same-origin fetch of the latest Actions-produced scan must degrade silently to the bundle.
- Drag-and-drop + file-picker ingestion of arbitrary schema-valid reports must never show a broken state.
- Determinism is part of the product story: identical reports render identically.
- Static hosting only: no server, no cookies, no analytics.

## Brand Commitments

Pinned visual world (docs/TASKS.md): dark terminal aesthetic — JetBrains Mono, near-black oklch surfaces, amber as the single verdict accent (cyan reserved semantically for the orphaned-surface state, red for errors). Name: Kernel Surface Ledger (`ksl`). Voice: precise, honest about uncertainty, zero marketing fluff; the tool's own copy style ("touched by nothing — free to remove") is the register.

## Evidence on Hand

- `fixtures/demo.json`: full schema-valid demo report (5 workloads, 22 elements, 5-step plan) — real rendered content, synthetic host.
- `fixtures/raw-demo.json`: the evidence snapshot behind it, committed for provenance.
- README.md pitch table showing the ledger/orphaned narrative shape.

## Product Principles

1. **The number leads.** Every view exists to make one honest figure undeniable (reachable weight, debt, CVEs killed).
2. **Attribution over inventory.** Show who holds surface, not just that it exists.
3. **Reversibility shown, always.** Every recommendation ships its revert next to it.
4. **Determinism visible.** The UI never fakes motion in scored fields; animations clarify, never alter.
5. **Degrade like the collector.** Missing data shows its reason; nothing renders as broken.

## Accessibility & Inclusion

Keyboard-operable tables and expandable rows; visible focus; contrast-safe amber on near-black (WCAG AA for text); `aria-sort` on sortable columns; motion respects reduced-motion preference.
