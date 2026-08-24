/**
 * Regression check on the narration layer: every CVE count, weight figure and
 * id the model states must exist in the deterministic report. The engine is the
 * source of truth — if the prose diverges, we say so in the UI instead of
 * trusting it.
 */

import type { KslReport } from "./ksl-types";

export interface Claim {
  kind: "cves" | "weight" | "id";
  /** what the model said, verbatim-ish */
  claimed: string;
  ok: boolean;
  note: string;
}

export interface ClaimReport {
  verdict: "verified" | "diverged" | "no-claims";
  claims: Claim[];
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.051;

function allowedCveCounts(report: KslReport): number[] {
  const values = new Set<number>();
  values.add(report.score.reachable_cve_count);
  values.add(report.orphaned.cves_neutralizable);
  const projected = report.score.projected_after_plan?.reachable_cve_count;
  if (typeof projected === "number") values.add(projected);
  let acc = 0;
  for (const s of [...report.plan].sort((a, b) => a.step - b.step)) {
    values.add(s.cves_killed);
    acc += s.cves_killed;
    values.add(acc);
  }
  for (const row of report.ledger) values.add(row.reachable_cves);
  return [...values];
}

function allowedWeights(report: KslReport): number[] {
  const values = new Set<number>();
  values.add(report.score.total_surface_weight);
  values.add(report.score.reachable_surface_weight);
  values.add(report.orphaned.total_weight);
  const projected = report.score.projected_after_plan?.reachable_surface_weight;
  if (typeof projected === "number") values.add(projected);
  for (const s of report.plan) if (s.weight_removed !== undefined) values.add(s.weight_removed);
  for (const el of report.surface_elements) values.add(el.weight);
  for (const row of report.ledger) {
    values.add(row.surface_debt);
    if (row.marginal_contribution !== undefined) values.add(row.marginal_contribution);
  }
  // Sums of per-step weights are legitimate too (a multi-step recommendation).
  let acc = 0;
  for (const s of [...report.plan].sort((a, b) => a.step - b.step)) {
    acc += s.weight_removed ?? 0;
    values.add(acc);
  }
  return [...values];
}

/** Compare the model's stated figures and ids against the report. */
export function checkClaims(report: KslReport, text: string): ClaimReport {
  const claims: Claim[] = [];
  const cveOk = allowedCveCounts(report);
  const weightOk = allowedWeights(report);

  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:reachable\s+)?CVEs?\b/gi)) {
    const n = Number(m[1]);
    const ok = cveOk.some((v) => near(v, n));
    claims.push({
      kind: "cves",
      claimed: `${m[1]} CVEs`,
      ok,
      note: ok
        ? "matches a cves_killed / reachable_cve_count value in the report"
        : "no cves_killed, cumulative or score value in the report equals this",
    });
  }

  for (const m of text.matchAll(/weight[^\d\n]{0,20}(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*weight/gi)) {
    const raw = m[1] ?? m[2];
    if (raw === undefined) continue;
    const n = Number(raw);
    const ok = weightOk.some((v) => near(v, n));
    claims.push({
      kind: "weight",
      claimed: `weight ${raw}`,
      ok,
      note: ok
        ? "matches a weight value in the report"
        : "no element, ledger, plan or score weight in the report equals this",
    });
  }

  const known = new Set<string>([
    ...report.surface_elements.map((e) => e.id),
    ...report.workloads.map((w) => w.id),
  ]);
  const seen = new Set<string>();
  for (const m of text.matchAll(/\b((?:mod|sc|sysctl|cap|dev|kcfg|lsm|ns|w)\.[a-z0-9_.-]+)/gi)) {
    const id = (m[1] ?? "").replace(/[.,;:)]+$/, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ok = known.has(id);
    claims.push({
      kind: "id",
      claimed: id,
      ok,
      note: ok ? "exists in the report" : "this id is not in surface_elements or workloads",
    });
  }

  if (claims.length === 0) return { verdict: "no-claims", claims };
  return { verdict: claims.every((c) => c.ok) ? "verified" : "diverged", claims };
}
