import { useMemo, useState } from "react";
import { BoolGlyph, Chip } from "./primitives";
import {
  filterElements,
  fmt,
  tierOf,
  uniqueSorted,
  type ElementFilters,
  type TierFilter,
} from "@/lib/ksl-report";
import type { KslReport } from "@/lib/ksl-types";
import { cn } from "@/lib/utils";

const TIERS: { key: TierFilter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "reachable_unused", label: "reachable · unused" },
  { key: "reachable_used", label: "reachable · used" },
  { key: "present_gated", label: "present · gated" },
  { key: "absent", label: "not present" },
];

const TIER_TONE: Record<TierFilter, "orphan" | "amber" | "neutral" | "ok"> = {
  all: "neutral",
  reachable_unused: "orphan",
  reachable_used: "amber",
  present_gated: "neutral",
  absent: "ok",
};

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border bg-surface px-2 py-1 text-xs text-foreground"
      >
        <option value="all">all</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GatesTable({ report }: { report: KslReport }) {
  const [filters, setFilters] = useState<ElementFilters>({
    tier: "all",
    kind: "all",
    subsystem: "all",
    query: "",
  });

  const kinds = useMemo(() => uniqueSorted(report.surface_elements.map((e) => e.kind)), [report]);
  const subsystems = useMemo(
    () => uniqueSorted(report.surface_elements.map((e) => e.subsystem)),
    [report],
  );
  const rows = useMemo(
    () => filterElements(report.surface_elements, filters),
    [report.surface_elements, filters],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={filters.tier === t.key}
            onClick={() => setFilters((f) => ({ ...f, tier: t.key }))}
            className={cn(
              "border px-2 py-1 text-[11px] transition-colors",
              filters.tier === t.key
                ? "border-amber bg-surface-raised text-amber"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Select
          label="kind"
          value={filters.kind}
          options={kinds}
          onChange={(v) => setFilters((f) => ({ ...f, kind: v }))}
        />
        <Select
          label="subsystem"
          value={filters.subsystem}
          options={subsystems}
          onChange={(v) => setFilters((f) => ({ ...f, subsystem: v }))}
        />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          search
          <input
            type="search"
            value={filters.query}
            placeholder="name, id, gate, cluster"
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            className="w-56 border border-border bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
          />
        </label>
        <span className="tnum text-[11px] text-muted-foreground">
          {rows.length} / {report.surface_elements.length} elements
        </span>
      </div>

      <div className="mt-4 overflow-x-auto border border-border">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Every surface element with its three reachability tiers and gate reason
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-normal">
                element
              </th>
              <th scope="col" className="px-3 py-2 text-right font-normal">
                weight
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                present
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                reachable unpriv
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                used
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                gate reason / mitigations
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((el) => (
              <tr key={el.id} className="border-b border-border align-top hover:bg-surface">
                <td className="px-3 py-2">
                  <p className="text-foreground">{el.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{el.id}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Chip>{el.kind}</Chip>
                    {el.subsystem ? <Chip>{el.subsystem}</Chip> : null}
                    <Chip tone={TIER_TONE[tierOf(el)]}>
                      {TIERS.find((t) => t.key === tierOf(el))?.label}
                    </Chip>
                    {el.cve_clusters.map((c) => (
                      <Chip key={c} tone="danger">
                        {c}
                      </Chip>
                    ))}
                  </div>
                </td>
                <td className="tnum px-3 py-2 text-right text-amber">{fmt(el.weight)}</td>
                <td className="px-3 py-2">
                  <BoolGlyph value={el.present} label="present" />
                </td>
                <td className="px-3 py-2">
                  <BoolGlyph value={el.reachable_unpriv} label="reachable by unprivileged user" />
                </td>
                <td className="px-3 py-2">
                  <BoolGlyph value={el.used} label="used by a live workload" />
                </td>
                <td className="px-3 py-2 text-xs leading-snug text-muted-foreground">
                  {el.gate_reason ?? <span className="italic">no gate reason recorded</span>}
                  {el.mitigations && el.mitigations.length > 0 ? (
                    <ul className="mt-1 list-inside list-disc text-foreground">
                      {el.mitigations.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No elements match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
