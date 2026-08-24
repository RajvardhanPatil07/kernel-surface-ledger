import { Chip } from "./primitives";
import { elementIndex, fmt } from "@/lib/ksl-report";
import type { KslReport } from "@/lib/ksl-types";
import { useMemo } from "react";

export function OrphanedGrid({ report }: { report: KslReport }) {
  const elements = useMemo(() => elementIndex(report), [report]);
  const orphans = report.orphaned.elements.map((id) => ({ id, el: elements.get(id) }));

  if (orphans.length === 0) {
    return (
      <p className="border border-border bg-surface p-4 text-sm text-muted-foreground">
        No orphaned surface in this report — every reachable element is touched by a live workload.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border border-orphan/40 bg-surface p-4">
        <p>
          <span className="tnum text-3xl font-bold text-orphan">
            {fmt(report.orphaned.total_weight)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            weighted units of unprivileged-reachable surface
          </span>
        </p>
        <p>
          <span className="tnum text-3xl font-bold text-orphan">
            {report.orphaned.cves_neutralizable}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            CVEs neutralizable at zero cost
          </span>
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orphans.map(({ id, el }) => (
          <div key={id} className="border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-foreground">{el?.name ?? id}</p>
              <span className="tnum shrink-0 text-sm text-orphan">{el ? fmt(el.weight) : "—"}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{id}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {el?.kind ? <Chip>{el.kind}</Chip> : null}
              {el?.subsystem ? <Chip>{el.subsystem}</Chip> : null}
              {el?.cve_clusters.map((c) => (
                <Chip key={c} tone="orphan">
                  {c}
                </Chip>
              ))}
            </div>
            {el?.gate_reason ? (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                gate: {el.gate_reason}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
