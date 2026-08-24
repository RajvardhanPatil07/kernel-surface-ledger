import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { deleteScan, listScans, saveScan } from "@/lib/scans.functions";
import { validateReport, fmt, fmtPercent, fmtCollectedAt } from "@/lib/ksl-report";
import { Section } from "@/components/ksl/primitives";

const TITLE = "Scan library — saved kernel surface scans | ksl";
const DESCRIPTION =
  "Save ksl reports per host, watch reachable surface and CVE mass move over time, and diff any two scans to prove a hardening step actually landed.";

export const Route = createFileRoute("/_authenticated/scans/")({
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
  component: ScanLibrary,
});

function ScanLibrary() {
  const queryClient = useQueryClient();
  const fetchScans = useServerFn(listScans);
  const upload = useServerFn(saveScan);
  const remove = useServerFn(deleteScan);

  const fileInput = useRef<HTMLInputElement>(null);
  const [hostLabel, setHostLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const scans = useQuery({ queryKey: ["scans"], queryFn: () => fetchScans() });

  const saveMutation = useMutation({
    mutationFn: (vars: { hostLabel: string; report: unknown }) => upload({ data: vars }),
    onSuccess: () => {
      setNotice("Scan saved.");
      setHostLabel("");
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "the save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "the delete failed"),
  });

  async function ingest(file: File) {
    setError(null);
    setNotice(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text()) as unknown;
    } catch (err) {
      setError(
        `${file.name} is not parseable JSON — ${err instanceof Error ? err.message : "parse failed"}`,
      );
      return;
    }
    const result = validateReport(parsed);
    if (!result.ok) {
      setError(`${file.name} is not a valid ksl report — ${result.reason}`);
      return;
    }
    saveMutation.mutate({ hostLabel, report: result.report });
  }

  const rows = scans.data ?? [];

  return (
    <main>
      <header className="mx-auto max-w-[1400px] px-4 pb-8 pt-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Scan library
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          One row per saved report. Keep a scan from before a hardening change and one from after,
          then diff them — the plan follow-through check tells you whether each step actually
          landed, rather than trusting that the artifact was applied.
        </p>
      </header>

      <Section id="upload" label="01 / ingest" title="Save a report">
        <div className="flex max-w-3xl flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="text-muted-foreground">host label (optional)</span>
            <input
              value={hostLabel}
              onChange={(e) => setHostLabel(e.target.value)}
              placeholder="edge-01 · pre-hardening"
              className="mt-1 block w-72 border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-amber-dim"
            />
          </label>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ingest(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={saveMutation.isPending}
            className="border border-amber-dim px-3 py-2 text-sm text-amber transition-colors hover:bg-surface disabled:opacity-50"
          >
            {saveMutation.isPending ? "saving…" : "Choose report.json"}
          </button>
        </div>

        {error ? (
          <p className="mt-4 max-w-3xl border border-destructive/50 bg-surface px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 max-w-3xl border border-ok/40 bg-surface px-3 py-2 text-xs text-ok">
            {notice}
          </p>
        ) : null}
      </Section>

      <Section
        id="scans"
        label="02 / history"
        title="Saved scans"
        lede={
          selected.length === 2
            ? "Two scans selected — open the diff."
            : "Select exactly two scans to compare them."
        }
      >
        {selected.length === 2 ? (
          <Link
            to="/scans/compare"
            search={{ before: selected[0]!, after: selected[1]! }}
            className="mb-4 inline-block border border-amber-dim px-3 py-1.5 text-xs text-amber transition-colors hover:bg-surface"
          >
            Compare selected →
          </Link>
        ) : null}

        {scans.isLoading ? (
          <p className="text-sm text-muted-foreground">loading scans…</p>
        ) : scans.isError ? (
          <p className="border border-destructive/50 bg-surface px-3 py-2 text-xs text-destructive">
            {scans.error instanceof Error ? scans.error.message : "the scan list failed to load"}
          </p>
        ) : rows.length === 0 ? (
          <p className="border border-border bg-surface p-4 text-sm text-muted-foreground">
            No scans yet. Save a <code>report.json</code> above, or drop one on the{" "}
            <Link to="/" className="text-amber underline">
              dashboard
            </Link>{" "}
            first to check it renders.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {[
                    "",
                    "host",
                    "kernel",
                    "collected",
                    "reachable wt",
                    "reachable CVEs",
                    "orphan",
                    "",
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const checked = selected.includes(s.id);
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`select ${s.host_label}`}
                          onChange={() =>
                            setSelected((prev) =>
                              checked
                                ? prev.filter((id) => id !== s.id)
                                : [...prev, s.id].slice(-2),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-foreground">{s.host_label}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.kernel_release} · {s.arch}
                      </td>
                      <td className="tnum px-3 py-2 text-muted-foreground">
                        {fmtCollectedAt(s.collected_at)}
                      </td>
                      <td className="tnum px-3 py-2 text-amber">
                        {fmt(s.reachable_surface_weight)}
                      </td>
                      <td className="tnum px-3 py-2 text-foreground">{s.reachable_cve_count}</td>
                      <td className="tnum px-3 py-2 text-muted-foreground">
                        {fmtPercent(s.orphan_ratio)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(s.id)}
                          className="text-[11px] text-muted-foreground underline transition-colors hover:text-destructive"
                        >
                          delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </main>
  );
}
