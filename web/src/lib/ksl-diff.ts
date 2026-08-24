import { elementIndex, tierOf, type TierFilter } from "./ksl-report";
import type { KslReport, KslSurfaceElement } from "./ksl-types";

export interface FigureDelta {
  label: string;
  before: number;
  after: number;
  delta: number;
  /** true when a lower number is the better outcome */
  lowerIsBetter: boolean;
}

export interface ElementChange {
  id: string;
  name: string;
  weight: number;
  before?: TierFilter;
  after?: TierFilter;
  cves: string[];
}

export interface WorkloadChange {
  workloadId: string;
  comm: string;
  before?: number;
  after?: number;
  delta: number;
}

export interface ReportDiff {
  figures: FigureDelta[];
  gone: ElementChange[];
  appeared: ElementChange[];
  retiered: ElementChange[];
  workloads: WorkloadChange[];
  cvesNeutralized: string[];
  cvesNewlyReachable: string[];
}

function reachableCves(report: KslReport): Set<string> {
  const set = new Set<string>();
  for (const e of report.surface_elements) {
    if (e.present && e.reachable_unpriv) for (const c of e.cve_clusters) set.add(c);
  }
  return set;
}

function change(el: KslSurfaceElement, before?: TierFilter, after?: TierFilter): ElementChange {
  return {
    id: el.id,
    name: el.name,
    weight: el.weight,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    cves: el.cve_clusters,
  };
}

export function diffReports(before: KslReport, after: KslReport): ReportDiff {
  const a = elementIndex(before);
  const b = elementIndex(after);

  const gone: ElementChange[] = [];
  const appeared: ElementChange[] = [];
  const retiered: ElementChange[] = [];

  for (const [id, el] of a) {
    const other = b.get(id);
    if (!other) {
      gone.push(change(el, tierOf(el)));
      continue;
    }
    const t1 = tierOf(el);
    const t2 = tierOf(other);
    if (t1 !== t2) retiered.push(change(other, t1, t2));
  }
  for (const [id, el] of b) {
    if (!a.has(id)) appeared.push(change(el, undefined, tierOf(el)));
  }

  const beforeDebt = new Map(before.ledger.map((r) => [r.workload_id, r.surface_debt]));
  const afterDebt = new Map(after.ledger.map((r) => [r.workload_id, r.surface_debt]));
  const comms = new Map<string, string>();
  for (const w of [...before.workloads, ...after.workloads]) comms.set(w.id, w.comm);

  const workloads: WorkloadChange[] = [...new Set([...beforeDebt.keys(), ...afterDebt.keys()])]
    .map((id) => {
      const x = beforeDebt.get(id);
      const y = afterDebt.get(id);
      return {
        workloadId: id,
        comm: comms.get(id) ?? id,
        ...(x === undefined ? {} : { before: x }),
        ...(y === undefined ? {} : { after: y }),
        delta: (y ?? 0) - (x ?? 0),
      };
    })
    .filter((w) => Math.abs(w.delta) > 0.0001)
    .sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));

  const cvesBefore = reachableCves(before);
  const cvesAfter = reachableCves(after);

  const figures: FigureDelta[] = [
    {
      label: "total surface weight",
      before: before.score.total_surface_weight,
      after: after.score.total_surface_weight,
      delta: after.score.total_surface_weight - before.score.total_surface_weight,
      lowerIsBetter: true,
    },
    {
      label: "reachable surface weight",
      before: before.score.reachable_surface_weight,
      after: after.score.reachable_surface_weight,
      delta: after.score.reachable_surface_weight - before.score.reachable_surface_weight,
      lowerIsBetter: true,
    },
    {
      label: "reachable CVEs",
      before: before.score.reachable_cve_count,
      after: after.score.reachable_cve_count,
      delta: after.score.reachable_cve_count - before.score.reachable_cve_count,
      lowerIsBetter: true,
    },
    {
      label: "orphan ratio",
      before: before.score.orphan_ratio,
      after: after.score.orphan_ratio,
      delta: after.score.orphan_ratio - before.score.orphan_ratio,
      lowerIsBetter: true,
    },
  ];

  return {
    figures,
    gone: gone.sort((p, q) => q.weight - p.weight),
    appeared: appeared.sort((p, q) => q.weight - p.weight),
    retiered: retiered.sort((p, q) => q.weight - p.weight),
    workloads,
    cvesNeutralized: [...cvesBefore].filter((c) => !cvesAfter.has(c)).sort(),
    cvesNewlyReachable: [...cvesAfter].filter((c) => !cvesBefore.has(c)).sort(),
  };
}

/**
 * Did the plan steps of the earlier scan actually land in the later scan?
 * Plan targets are matched by element id first, then by element name, because
 * a plan step names a module/sysctl the way an operator would write it. A
 * target that resolves to nothing is reported as unverifiable — never as
 * applied, since "absent" would otherwise read as success.
 */
export function planFollowThrough(
  before: KslReport,
  after: KslReport,
): {
  step: number;
  action: string;
  targets: string[];
  status: "landed" | "not_applied" | "unverifiable";
  detail: string;
}[] {
  const afterIndex = elementIndex(after);
  const byName = new Map<string, KslSurfaceElement>();
  for (const el of after.surface_elements) {
    byName.set(el.name.toLowerCase(), el);
    // sysctl targets are often written "kernel.kptr_restrict=2"
    byName.set(el.name.toLowerCase().split("=")[0]!.trim(), el);
  }

  return [...before.plan]
    .sort((x, y) => x.step - y.step)
    .map((step) => {
      const states = step.targets.map((t) => {
        const el =
          afterIndex.get(t) ??
          byName.get(t.toLowerCase()) ??
          byName.get(t.toLowerCase().split("=")[0]!.trim());
        if (!el)
          return { t, state: "unknown" as const, why: "not present in the later scan's elements" };
        if (!el.present) return { t, state: "ok" as const, why: "no longer present" };
        if (!el.reachable_unpriv) return { t, state: "ok" as const, why: "present but gated" };
        return { t, state: "bad" as const, why: "still reachable unprivileged" };
      });

      const status: "landed" | "not_applied" | "unverifiable" =
        states.length === 0 || states.some((s) => s.state === "unknown")
          ? "unverifiable"
          : states.every((s) => s.state === "ok")
            ? "landed"
            : "not_applied";

      return {
        step: step.step,
        action: step.action,
        targets: step.targets,
        status,
        detail: states.map((s) => `${s.t}: ${s.why}`).join("; ") || "no targets recorded",
      };
    });
}
