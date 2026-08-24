import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Chip, WeightBar } from "./primitives";
import { NarrateBlock } from "./NarrateBlock";
import { cn } from "@/lib/utils";
import { elementIndex, fmt, sortLedger, workloadIndex, type LedgerSortKey } from "@/lib/ksl-report";
import { groundingContext } from "@/lib/ksl-summary";
import type { KslReport } from "@/lib/ksl-types";

const COLUMNS: { key: LedgerSortKey; label: string; numeric?: boolean }[] = [
  { key: "workload", label: "workload" },
  { key: "surface_debt", label: "surface debt", numeric: true },
  { key: "marginal_contribution", label: "marginal", numeric: true },
  { key: "reachable_cves", label: "reachable CVEs", numeric: true },
];

export function LedgerTable({ report }: { report: KslReport }) {
  const [sortKey, setSortKey] = useState<LedgerSortKey>("surface_debt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const workloads = useMemo(() => workloadIndex(report), [report]);
  const grounding = useMemo(() => groundingContext(report), [report]);

  const elements = useMemo(() => elementIndex(report), [report]);
  const rows = useMemo(
    () => sortLedger(report.ledger, workloads, sortKey, dir),
    [report.ledger, workloads, sortKey, dir],
  );
  const maxDebt = useMemo(
    () => Math.max(report.orphaned.total_weight, ...report.ledger.map((r) => r.surface_debt), 1),
    [report],
  );

  function toggleSort(key: LedgerSortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "workload" ? "asc" : "desc");
    }
  }

  function elName(id: string) {
    return elements.get(id)?.name ?? id;
  }

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <caption className="sr-only">
          Surface debt ledger: kernel attack surface attributed to each live workload
        </caption>
        <thead>
          <tr className="border-b border-border bg-surface">
            <th scope="col" className="w-8 px-2 py-2">
              <span className="sr-only">expand</span>
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sortKey === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"
                }
                className={cn(
                  "px-3 py-2 text-[11px] font-normal uppercase tracking-[0.14em] text-muted-foreground",
                  c.numeric && "text-right",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className="inline-flex items-center gap-1 uppercase transition-colors hover:text-amber"
                >
                  {c.label}
                  {sortKey === c.key ? (
                    <span aria-hidden className="text-amber">
                      {dir === "asc" ? "▲" : "▼"}
                    </span>
                  ) : null}
                </button>
              </th>
            ))}
            <th
              scope="col"
              className="px-3 py-2 text-[11px] font-normal uppercase tracking-[0.14em] text-muted-foreground"
            >
              sole owner
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const wl = workloads.get(row.workload_id);
            const isOpen = Boolean(open[row.workload_id]);
            const detailId = `ledger-detail-${row.workload_id}`;
            return (
              <Fragment key={row.workload_id}>
                <tr className="border-b border-border align-top transition-colors hover:bg-surface">
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      onClick={() =>
                        setOpen((o) => ({ ...o, [row.workload_id]: !o[row.workload_id] }))
                      }
                      className="text-muted-foreground transition-colors hover:text-amber"
                    >
                      {isOpen ? (
                        <ChevronDown className="size-4" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4" aria-hidden />
                      )}
                      <span className="sr-only">
                        {isOpen ? "Collapse" : "Expand"} {wl?.comm ?? row.workload_id}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-foreground">{wl?.comm ?? row.workload_id}</span>
                    {wl?.unit ? (
                      <span className="ml-2 text-xs text-muted-foreground">{wl.unit}</span>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {[...row.sole_owner_elements, ...row.shared_elements]
                        .slice(0, 4)
                        .map((id) => (
                          <Chip
                            key={id}
                            title={id}
                            tone={row.sole_owner_elements.includes(id) ? "amber" : "neutral"}
                          >
                            {elName(id)}
                          </Chip>
                        ))}
                      {row.sole_owner_elements.length + row.shared_elements.length > 4 ? (
                        <Chip>
                          +{row.sole_owner_elements.length + row.shared_elements.length - 4}
                        </Chip>
                      ) : null}
                    </div>
                  </td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-right text-amber">
                    {fmt(row.surface_debt, 2)}
                    <WeightBar value={row.surface_debt} max={maxDebt} />
                  </td>
                  <td className="tnum px-3 py-2 text-right text-foreground">
                    {row.marginal_contribution === undefined
                      ? "—"
                      : fmt(row.marginal_contribution, 2)}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-foreground">
                    {row.reachable_cves}
                  </td>
                  <td className="px-3 py-2">
                    {row.sole_owner_elements.length > 0 ? (
                      <Chip tone="amber">yes · {row.sole_owner_elements.length}</Chip>
                    ) : (
                      <Chip>no</Chip>
                    )}
                  </td>
                </tr>
                {isOpen ? (
                  <tr id={detailId} className="border-b border-border bg-surface">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-amber-dim">
                            why this workload holds this surface
                          </p>
                          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                            {row.explanation ?? "No narration in this report."}
                          </p>
                          <NarrateBlock
                            context={grounding}
                            targetKind="workload"
                            targetId={row.workload_id}
                            targetLabel={wl?.comm ?? row.workload_id}
                            label="Re-narrate this row live"
                          />
                        </div>
                        <dl className="space-y-3 text-xs">
                          <div>
                            <dt className="text-muted-foreground">sole-owned surface</dt>
                            <dd className="mt-1 flex flex-wrap gap-1">
                              {row.sole_owner_elements.length === 0 ? (
                                <span className="text-muted-foreground">none</span>
                              ) : (
                                row.sole_owner_elements.map((id) => (
                                  <Chip key={id} tone="amber" title={id}>
                                    {elName(id)}
                                  </Chip>
                                ))
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">shared surface</dt>
                            <dd className="mt-1 flex flex-wrap gap-1">
                              {row.shared_elements.length === 0 ? (
                                <span className="text-muted-foreground">none</span>
                              ) : (
                                row.shared_elements.map((id) => (
                                  <Chip key={id} title={id}>
                                    {elName(id)}
                                  </Chip>
                                ))
                              )}
                            </dd>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <dt className="text-muted-foreground">uid</dt>
                              <dd className="tnum text-foreground">{wl?.uid ?? "—"}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">seccomp mode</dt>
                              <dd className="tnum text-foreground">
                                {wl?.seccomp_mode === undefined ? "—" : wl.seccomp_mode}
                              </dd>
                            </div>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">pids</dt>
                            <dd className="tnum text-foreground">{wl?.pids.join(", ") ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">effective caps</dt>
                            <dd className="mt-1 flex flex-wrap gap-1">
                              {wl?.caps_effective && wl.caps_effective.length > 0 ? (
                                wl.caps_effective.map((c) => <Chip key={c}>{c}</Chip>)
                              ) : (
                                <span className="text-muted-foreground">none recorded</span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}

          {/* Pinned orphan row — the point of the whole ledger. */}
          <tr className="border-t-2 border-orphan/50 bg-surface-raised">
            <td className="px-2 py-3" />
            <td className="px-3 py-3">
              <span className="uppercase tracking-[0.16em] text-orphan">orphaned</span>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                reachable by any local user, touched by <span className="text-orphan">nothing</span>{" "}
                — {report.orphaned.elements.length} elements
              </p>
            </td>
            <td className="tnum whitespace-nowrap px-3 py-3 text-right text-orphan">
              {fmt(report.orphaned.total_weight)}
              <WeightBar value={report.orphaned.total_weight} max={maxDebt} />
            </td>
            <td className="px-3 py-3 text-right text-muted-foreground">—</td>
            <td className="tnum px-3 py-3 text-right text-orphan">
              {report.orphaned.cves_neutralizable}
            </td>
            <td className="px-3 py-3 text-muted-foreground">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
