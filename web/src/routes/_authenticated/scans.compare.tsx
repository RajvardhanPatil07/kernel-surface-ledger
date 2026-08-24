import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getScan } from "@/lib/scans.functions";
import { diffReports, planFollowThrough } from "@/lib/ksl-diff";
import { fmt, fmtCollectedAt } from "@/lib/ksl-report";
import { Chip, Section } from "@/components/ksl/primitives";

const TITLE = "Compare scans — did the hardening actually land? | ksl";
const DESCRIPTION =
  "Diff two ksl scans of the same host: reachable surface and CVE deltas, elements that changed reachability tier, workload debt shifts, and per-step plan follow-through.";

export const Route = createFileRoute("/_authenticated/scans/compare")({
  validateSearch: (search: Record<string, unknown>) => ({
    before: typeof search["before"] === "string" ? search["before"] : "",
    after: typeof search["after"] === "string" ? search["after"] : "",
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompareScans,
});

const TIER_LABEL: Record<string, string> = {
  absent: "absent",
  present_gated: "present but gated",
  reachable_unused: "reachable, unused",
  reachable_used: "reachable, used",
};

function CompareScans() {
  const { before, after } = Route.useSearch();
  const fetchScan = useServerFn(getScan);

  const beforeQuery = useQuery({
    queryKey: ["scan", before],
    queryFn: () => fetchScan({ data: { id: before } }),
    enabled: Boolean(before),
  });
  const afterQuery = useQuery({
    queryKey: ["scan", after],
    queryFn: () => fetchScan({ data: { id: after } }),
    enabled: Boolean(after),
  });

  const diff = useMemo(
    () =>
      beforeQuery.data && afterQuery.data
        ? diffReports(beforeQuery.data.report, afterQuery.data.report)
        : null,
    [beforeQuery.data, afterQuery.data],
  );

  const follow = useMemo(
    () =>
      beforeQuery.data && afterQuery.data
        ? planFollowThrough(beforeQuery.data.report, afterQuery.data.report)
        : [],
    [beforeQuery.data, afterQuery.data],
  );

  if (!before || !after) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
        <h1 className="text-xl font-bold text-foreground">Pick two scans</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          A comparison needs a before and an after.{" "}
          <Link to="/scans" className="text-amber underline">
            Select two scans in the library
          </Link>{" "}
          and open the diff from there.
        </p>
      </main>
    );
  }

  const failure = beforeQuery.error ?? afterQuery.error;
  if (failure) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
        <h1 className="text-xl font-bold text-foreground">That comparison could not be loaded</h1>
        <p className="mt-3 max-w-2xl border border-destructive/50 bg-surface px-3 py-2 text-xs text-destructive">
          {failure instanceof Error ? failure.message : "one of the scans failed to load"}
        </p>
        <Link to="/scans" className="mt-6 inline-block text-xs text-amber underline">
          ← back to the library
        </Link>
      </main>
    );
  }

  if (!diff || !beforeQuery.data || !afterQuery.data) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
        <p className="text-sm text-muted-foreground">loading both scans…</p>
      </main>
    );
  }

  const b = beforeQuery.data.scan;
  const a = afterQuery.data.scan;

  return (
    <main>
      <header className="mx-auto max-w-[1400px] px-4 pb-8 pt-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {b.host_label} → {a.host_label}
        </h1>
        <p className="mt-2 tnum text-xs text-muted-foreground">
          {fmtCollectedAt(b.collected_at)} → {fmtCollectedAt(a.collected_at)}
        </p>
        {b.kernel_release !== a.kernel_release ? (
          <p className="mt-3 max-w-3xl border border-amber-dim bg-surface px-3 py-2 text-xs text-amber">
            Different kernel releases ({b.kernel_release} vs {a.kernel_release}) — some of this
            delta is the kernel changing under you, not hardening you applied.
          </p>
        ) : null}
      </header>

      <Section id="figures" label="01 / movement" title="Headline deltas">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {diff.figures.map((f) => {
            const improved = f.lowerIsBetter ? f.delta < 0 : f.delta > 0;
            const tone =
              f.delta === 0 ? "text-muted-foreground" : improved ? "text-ok" : "text-destructive";
            return (
              <div key={f.label} className="border border-border bg-surface p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {f.label}
                </p>
                <p className="tnum mt-3 text-2xl font-bold text-foreground">
                  {fmt(f.before, 3)} <span className="text-muted-foreground">→</span>{" "}
                  {fmt(f.after, 3)}
                </p>
                <p className={`tnum mt-1 text-sm ${tone}`}>
                  {f.delta > 0 ? "+" : ""}
                  {fmt(f.delta, 3)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="border border-ok/40 bg-surface p-4">
            <p className="text-xs text-ok">
              CVE clusters no longer reachable ({diff.cvesNeutralized.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {diff.cvesNeutralized.length === 0 ? (
                <span className="text-xs text-muted-foreground">none</span>
              ) : (
                diff.cvesNeutralized.map((c) => (
                  <Chip key={c} tone="ok">
                    {c}
                  </Chip>
                ))
              )}
            </div>
          </div>
          <div className="border border-destructive/40 bg-surface p-4">
            <p className="text-xs text-destructive">
              newly reachable CVE clusters ({diff.cvesNewlyReachable.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {diff.cvesNewlyReachable.length === 0 ? (
                <span className="text-xs text-muted-foreground">none</span>
              ) : (
                diff.cvesNewlyReachable.map((c) => (
                  <Chip key={c} tone="danger">
                    {c}
                  </Chip>
                ))
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="follow"
        label="02 / verification"
        title="Plan follow-through"
        lede="Each step of the earlier scan's plan, checked against the later scan's actual element states. This is the claim that a hardening tool has to be able to make."
      >
        <div className="space-y-2">
          {follow.length === 0 ? (
            <p className="text-sm text-muted-foreground">The earlier scan carried no plan steps.</p>
          ) : (
            follow.map((s) => (
              <div
                key={s.step}
                className={`border p-3 ${
                  s.status === "landed"
                    ? "border-ok/40"
                    : s.status === "not_applied"
                      ? "border-risk-high/40"
                      : "border-border"
                } bg-surface`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="tnum text-xs text-muted-foreground">step {s.step}</span>
                  <span className="text-sm text-foreground">{s.action}</span>
                  <span
                    className={`ml-auto border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${
                      s.status === "landed"
                        ? "border-ok/50 text-ok"
                        : s.status === "not_applied"
                          ? "border-risk-high/50 text-risk-high"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {s.status === "landed"
                      ? "landed"
                      : s.status === "not_applied"
                        ? "not applied"
                        : "unverifiable"}
                  </span>
                </div>

                <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {s.detail}
                </p>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section
        id="elements"
        label="03 / detail"
        title="Elements that changed"
        lede="Retiered elements are the interesting class: same element, different reachability, which is what a hardening step is supposed to produce."
      >
        <div className="space-y-6">
          {(
            [
              ["retiered", diff.retiered],
              ["gone", diff.gone],
              ["appeared", diff.appeared],
            ] as const
          ).map(([label, list]) => (
            <div key={label}>
              <h3 className="text-sm font-bold text-foreground">
                {label} <span className="tnum text-muted-foreground">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">nothing in this class</p>
              ) : (
                <div className="mt-2 overflow-x-auto border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface text-left">
                        {["element", "weight", "before", "after", "cve clusters"].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((el) => (
                        <tr key={el.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <span className="text-foreground">{el.name}</span>
                            <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                              {el.id}
                            </span>
                          </td>
                          <td className="tnum px-3 py-2 text-amber">{fmt(el.weight)}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {el.before ? TIER_LABEL[el.before] : "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {el.after ? TIER_LABEL[el.after] : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {el.cves.length === 0
                                ? "—"
                                : el.cves.map((c) => <Chip key={c}>{c}</Chip>)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="workloads"
        label="04 / attribution shift"
        title="Workload debt movement"
        lede="Surface debt moving between workloads without the total falling means the liability was reassigned, not removed."
      >
        {diff.workloads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workload's surface debt changed.</p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {["workload", "before", "after", "delta"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diff.workloads.map((w) => (
                  <tr key={w.workloadId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-foreground">{w.comm}</td>
                    <td className="tnum px-3 py-2 text-muted-foreground">
                      {w.before === undefined ? "—" : fmt(w.before)}
                    </td>
                    <td className="tnum px-3 py-2 text-muted-foreground">
                      {w.after === undefined ? "—" : fmt(w.after)}
                    </td>
                    <td
                      className={`tnum px-3 py-2 ${w.delta < 0 ? "text-ok" : "text-destructive"}`}
                    >
                      {w.delta > 0 ? "+" : ""}
                      {fmt(w.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="mx-auto max-w-[1400px] px-4 pb-12 sm:px-6">
        <Link to="/scans" className="text-xs text-amber underline">
          ← back to the library
        </Link>
      </div>
    </main>
  );
}
