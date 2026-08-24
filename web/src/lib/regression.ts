import type { KslReport } from "./ksl-types";
import { elementIndex, workloadIndex } from "./ksl-report";

export interface ScoreDelta {
  label: string;
  before: number;
  after: number;
  /** lower is better (reachable CVEs, reachable weight); false = neutral */
  lowerIsBetter: boolean;
  digits?: number;
}

export interface DebtChange {
  workloadId: string;
  comm: string;
  before: number;
  after: number;
  delta: number;
}

export interface ReportDiff {
  deltas: ScoreDelta[];
  newlyOrphaned: string[];
  noLongerOrphaned: string[];
  debtChanges: DebtChange[];
  hostBefore: string;
  hostAfter: string;
}

function hostLine(report: KslReport): string {
  return `${report.meta.distro} · ${report.meta.kernel_release}`;
}

/** Structural comparison of two reports over the frozen contract. Pure. */
export function diffReports(base: KslReport, next: KslReport): ReportDiff {
  const baseOrphans = new Set(base.orphaned.elements);
  const nextOrphans = new Set(next.orphaned.elements);
  const newlyOrphaned = [...nextOrphans].filter((id) => !baseOrphans.has(id)).sort();
  const noLongerOrphaned = [...baseOrphans].filter((id) => !nextOrphans.has(id)).sort();

  const baseDebt = new Map(base.ledger.map((r) => [r.workload_id, r.surface_debt]));
  const nextDebt = new Map(next.ledger.map((r) => [r.workload_id, r.surface_debt]));
  const commOf = (id: string): string => {
    const wl = workloadIndex(next).get(id) ?? workloadIndex(base).get(id) ?? undefined;
    return wl?.comm ?? id;
  };
  const ids = new Set([...baseDebt.keys(), ...nextDebt.keys()]);
  const debtChanges: DebtChange[] = [];
  for (const id of ids) {
    const before = baseDebt.get(id) ?? 0;
    const after = nextDebt.get(id) ?? 0;
    const delta = Math.round((after - before) * 100) / 100;
    if (delta !== 0) {
      debtChanges.push({ workloadId: id, comm: commOf(id), before, after, delta });
    }
  }
  debtChanges.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.workloadId.localeCompare(b.workloadId),
  );

  const deltas: ScoreDelta[] = [
    {
      label: "reachable surface weight",
      before: base.score.reachable_surface_weight,
      after: next.score.reachable_surface_weight,
      lowerIsBetter: true,
      digits: 1,
    },
    {
      label: "reachable CVEs",
      before: base.score.reachable_cve_count,
      after: next.score.reachable_cve_count,
      lowerIsBetter: true,
    },
    {
      label: "orphaned weight",
      before: base.orphaned.total_weight,
      after: next.orphaned.total_weight,
      lowerIsBetter: false,
      digits: 1,
    },
    {
      label: "orphan ratio",
      before: base.score.orphan_ratio,
      after: next.score.orphan_ratio,
      lowerIsBetter: false,
      digits: 3,
    },
  ];

  return {
    deltas,
    newlyOrphaned,
    noLongerOrphaned,
    debtChanges,
    hostBefore: hostLine(base),
    hostAfter: hostLine(next),
  };
}

/** Element names for chip labels, falling back to the raw id. */
export function elementNameOf(report: KslReport, id: string): string {
  return elementIndex(report).get(id)?.name ?? id;
}
