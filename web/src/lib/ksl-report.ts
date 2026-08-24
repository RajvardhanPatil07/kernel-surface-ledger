import type { KslLedgerRow, KslReport, KslSurfaceElement, KslWorkload } from "./ksl-types";

/** Shape validation against the frozen report contract. Pure, no throw. */
export function validateReport(
  input: unknown,
): { ok: true; report: KslReport } | { ok: false; reason: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "top level is not an object" };
  }
  const r = input as Record<string, unknown>;

  const requiredArrays = ["surface_elements", "workloads", "ledger", "plan"];
  for (const key of requiredArrays) {
    if (!Array.isArray(r[key])) {
      return { ok: false, reason: `missing or non-array "${key}"` };
    }
  }
  for (const key of ["meta", "orphaned", "score"]) {
    if (typeof r[key] !== "object" || r[key] === null) {
      return { ok: false, reason: `missing or non-object "${key}"` };
    }
  }

  const meta = r["meta"] as Record<string, unknown>;
  for (const key of ["kernel_release", "arch", "distro", "collected_at", "ksl_version"]) {
    if (typeof meta[key] !== "string") {
      return { ok: false, reason: `meta.${key} must be a string` };
    }
  }

  const score = r["score"] as Record<string, unknown>;
  for (const key of [
    "total_surface_weight",
    "reachable_surface_weight",
    "reachable_cve_count",
    "orphan_ratio",
  ]) {
    if (typeof score[key] !== "number") {
      return { ok: false, reason: `score.${key} must be a number` };
    }
  }

  const orphaned = r["orphaned"] as Record<string, unknown>;
  if (!Array.isArray(orphaned["elements"])) {
    return { ok: false, reason: "orphaned.elements must be an array" };
  }

  const badElement = (r["surface_elements"] as unknown[]).findIndex((e) => {
    if (typeof e !== "object" || e === null) return true;
    const el = e as Record<string, unknown>;
    return (
      typeof el["id"] !== "string" ||
      typeof el["name"] !== "string" ||
      typeof el["weight"] !== "number" ||
      typeof el["present"] !== "boolean" ||
      typeof el["reachable_unpriv"] !== "boolean" ||
      typeof el["used"] !== "boolean"
    );
  });
  if (badElement !== -1) {
    return { ok: false, reason: `surface_elements[${badElement}] is malformed` };
  }

  return { ok: true, report: input as KslReport };
}

export function elementIndex(report: KslReport): Map<string, KslSurfaceElement> {
  return new Map(report.surface_elements.map((e) => [e.id, e]));
}

export function workloadIndex(report: KslReport): Map<string, KslWorkload> {
  return new Map(report.workloads.map((w) => [w.id, w]));
}

/**
 * Plan steps name their targets the way an operator would type them
 * ("bluetooth", "cramfs", "kernel.dmesg_restrict=1"), not always as element
 * ids. Resolve one back to the element it removes so the ledger, the impact
 * graph and the check panel all agree on what a step touches.
 */
export function resolveTarget(report: KslReport, target: string): KslSurfaceElement | undefined {
  const raw = target.trim();
  const bare = raw.split("=")[0]!.trim();
  const candidates = [raw, bare];

  for (const el of report.surface_elements) {
    if (candidates.includes(el.id)) return el;
  }
  for (const el of report.surface_elements) {
    if (candidates.includes(el.name)) return el;
    // Bundled modules list their members: "cramfs / freevxfs / jffs2 / …".
    const members = el.name.split("/").map((p) => p.trim());
    if (members.some((m) => candidates.includes(m))) return el;
  }
  // Prefixed ids: a target "bluetooth" is element "mod.bluetooth".
  for (const el of report.surface_elements) {
    if (candidates.some((c) => el.id.endsWith(`.${c}`))) return el;
  }
  // Last resort: the gate reason enumerates autoloadable module names.
  for (const el of report.surface_elements) {
    const reason = el.gate_reason ?? "";
    if (
      bare.length > 2 &&
      new RegExp(`\\b${bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(reason)
    ) {
      return el;
    }
  }
  return undefined;
}

export type LedgerSortKey =
  "workload" | "surface_debt" | "marginal_contribution" | "reachable_cves";

export function sortLedger(
  rows: KslLedgerRow[],
  workloads: Map<string, KslWorkload>,
  key: LedgerSortKey,
  dir: "asc" | "desc",
): KslLedgerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "workload") {
      const an = workloads.get(a.workload_id)?.comm ?? a.workload_id;
      const bn = workloads.get(b.workload_id)?.comm ?? b.workload_id;
      return an.localeCompare(bn) * sign;
    }
    const av = key === "marginal_contribution" ? (a.marginal_contribution ?? 0) : a[key];
    const bv = key === "marginal_contribution" ? (b.marginal_contribution ?? 0) : b[key];
    return ((av as number) - (bv as number)) * sign;
  });
}

/** True when a ledger row solely owns the element (nothing else touches it). */
export function isSoleOwner(row: KslLedgerRow): boolean {
  return row.sole_owner_elements.length > 0;
}

export type TierFilter = "all" | "reachable_unused" | "reachable_used" | "present_gated" | "absent";

export function tierOf(el: KslSurfaceElement): TierFilter {
  if (!el.present) return "absent";
  if (!el.reachable_unpriv) return "present_gated";
  return el.used ? "reachable_used" : "reachable_unused";
}

export interface ElementFilters {
  tier: TierFilter;
  kind: string;
  subsystem: string;
  query: string;
}

export function filterElements(
  elements: KslSurfaceElement[],
  f: ElementFilters,
): KslSurfaceElement[] {
  const q = f.query.trim().toLowerCase();
  return elements.filter((el) => {
    if (f.tier !== "all" && tierOf(el) !== f.tier) return false;
    if (f.kind !== "all" && el.kind !== f.kind) return false;
    if (f.subsystem !== "all" && (el.subsystem ?? "—") !== f.subsystem) return false;
    if (!q) return true;
    return (
      el.name.toLowerCase().includes(q) ||
      el.id.toLowerCase().includes(q) ||
      (el.gate_reason ?? "").toLowerCase().includes(q) ||
      el.cve_clusters.join(" ").toLowerCase().includes(q)
    );
  });
}

export function uniqueSorted(values: (string | undefined)[]): string[] {
  return [...new Set(values.map((v) => v ?? "—"))].sort((a, b) => a.localeCompare(b));
}

/** Running CVE mass killed as plan steps accumulate. */
export function cumulativePlan(report: KslReport): { step: number; cumulative: number }[] {
  let acc = 0;
  return [...report.plan]
    .sort((a, b) => a.step - b.step)
    .map((s) => {
      acc += s.cves_killed;
      return { step: s.step, cumulative: acc };
    });
}

export function fmt(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

export function fmtPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function fmtCollectedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "Z");
}
