import { FileDown, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Figure } from "./primitives";
import { LoadErrorPanel, type LoadFailure } from "./LoadErrorPanel";
import { fmt, fmtCollectedAt, fmtPercent } from "@/lib/ksl-report";
import { downloadHardeningPdf } from "@/lib/ksl-pdf";
import type { KslReport } from "@/lib/ksl-types";

const NAV = [
  { href: "#ledger", label: "Ledger" },
  { href: "#orphaned", label: "Orphaned" },
  { href: "#gates", label: "Gates" },
  { href: "#plan", label: "Plan" },
  { href: "#provenance", label: "Provenance" },
];

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label} </span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

export function HeaderBand({
  report,
  sourceLabel,
  onLoadFile,
  failure,
  onDismissFailure,
}: {
  report: KslReport;
  sourceLabel: string;
  onLoadFile: (file: File) => void;
  failure: LoadFailure | null;
  onDismissFailure: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pdfState, setPdfState] = useState<"idle" | "working" | "error">("idle");
  const { meta, score } = report;
  const projected = score.projected_after_plan;

  return (
    <header className="mx-auto max-w-[1400px] px-4 pb-10 pt-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Kernel Surface Ledger <span className="text-amber">ksl</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every other tool tells you <em>what</em> kernel attack surface is exposed. This one
            tells you <span className="text-foreground">who is responsible for it</span>, what
            nothing is using, and the shortest way out.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
            >
              <Upload className="size-3.5" aria-hidden />
              Load report.json
            </button>
            <button
              type="button"
              disabled={pdfState === "working"}
              onClick={async () => {
                setPdfState("working");
                try {
                  await downloadHardeningPdf(report, sourceLabel);
                  setPdfState("idle");
                } catch {
                  setPdfState("error");
                }
              }}
              className="inline-flex items-center gap-2 border border-amber-dim bg-surface px-3 py-1.5 text-xs text-amber transition-colors hover:bg-surface-raised disabled:opacity-50"
            >
              <FileDown className="size-3.5" aria-hidden />
              {pdfState === "working"
                ? "building PDF…"
                : pdfState === "error"
                  ? "PDF failed — retry"
                  : "Download hardening PDF"}
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLoadFile(file);
              e.target.value = "";
            }}
          />
          <span className="text-[11px] text-muted-foreground">source: {sourceLabel}</span>
        </div>
      </div>

      {failure ? (
        <LoadErrorPanel
          failure={failure}
          onDismiss={onDismissFailure}
          onRetry={() => inputRef.current?.click()}
        />
      ) : null}

      <nav
        aria-label="Report sections"
        className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-y border-border py-2 text-xs"
      >
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className="text-muted-foreground transition-colors hover:text-amber"
          >
            {n.label}
          </a>
        ))}
      </nav>

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <MetaItem label="kernel" value={meta.kernel_release} />
        <MetaItem label="arch" value={meta.arch} />
        <MetaItem label="distro" value={meta.distro} />
        <MetaItem label="collected" value={fmtCollectedAt(meta.collected_at)} />
        <MetaItem label="trace" value={`${meta.trace_backend ?? "n/a"} / ${meta.trace_seconds}s`} />
        <MetaItem
          label="privilege"
          value={
            meta.ran_as_root === undefined
              ? "unknown"
              : meta.ran_as_root
                ? "root"
                : "non-root (partial)"
          }
        />
        <MetaItem label="ksl" value={meta.ksl_version} />
      </div>

      {meta.skipped && meta.skipped.length > 0 ? (
        <div className="mt-3 border border-amber-dim/50 bg-surface px-3 py-2 text-xs">
          <p className="text-amber">partial data — {meta.skipped.length} source(s) skipped</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {meta.skipped.map((s, i) => (
              <li key={`${s.source}-${i}`}>
                {s.source ?? "unknown source"}: {s.reason ?? "no reason given"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="total surface weight"
          value={fmt(score.total_surface_weight)}
          hint="every element present, reachable or not"
        />
        <Figure
          label="reachable surface weight"
          value={fmt(score.reachable_surface_weight)}
          projected={
            projected?.reachable_surface_weight !== undefined
              ? fmt(projected.reachable_surface_weight)
              : undefined
          }
          emphasis
          hint="reachable by an unprivileged local user"
        />
        <Figure
          label="reachable CVEs"
          value={String(score.reachable_cve_count)}
          projected={
            projected?.reachable_cve_count !== undefined
              ? String(projected.reachable_cve_count)
              : undefined
          }
          emphasis
          hint="CVE mass behind reachable surface"
        />
        <Figure
          label="orphan ratio"
          value={fmtPercent(score.orphan_ratio)}
          hint="reachable weight touched by nothing"
        />
      </div>
    </header>
  );
}
