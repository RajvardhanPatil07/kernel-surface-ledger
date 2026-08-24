import { FileDown, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Figure } from "./primitives";
import { LoadErrorPanel, type LoadFailure } from "./LoadErrorPanel";
import { fmt, fmtCollectedAt, fmtPercent } from "@/lib/ksl-report";
import { downloadHardeningPdf } from "@/lib/ksl-pdf";
import type { KslReport } from "@/lib/ksl-types";

const NAV = [
  { href: "#ask", label: "Ask" },
  { href: "#ledger", label: "Ledger" },
  { href: "#orphaned", label: "Orphans" },
  { href: "#gates", label: "Gates" },
  { href: "#plan", label: "Plan" },
  { href: "#impact", label: "Impact" },
  { href: "#provenance", label: "AI boundary" },
];

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="mono whitespace-nowrap text-[10px] uppercase tracking-[0.08em]">
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
    <header className="hero-grid overflow-hidden border-b border-border">
      <div className="mx-auto max-w-[1440px] px-5 pb-16 pt-5 sm:px-8 sm:pb-20 lg:px-10">
        <div className="flex items-center justify-between gap-6 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">01.</span>
            <span className="text-xs font-medium tracking-[0.08em]">KERNEL SURFACE LEDGER</span>
          </div>
          <div className="mono text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            AI-assisted kernel attack surface analyzer
          </div>
        </div>

        <div className="grid gap-12 pt-14 lg:grid-cols-[1.25fr_0.75fr] lg:gap-20 lg:pt-20">
          <div>
            <p className="label-caps mono text-muted-foreground">AI / Linux / Security</p>
            <h1 className="display-tight mt-5 max-w-5xl text-6xl font-semibold leading-[0.83] sm:text-7xl lg:text-[8.5rem]">
              See the
              <br />
              attack surface.
            </h1>
            <div className="mt-8 max-w-2xl border-l border-foreground pl-5">
              <p className="text-base leading-7 text-foreground sm:text-lg">
                A read-only analyzer that maps kernel exposure to the workloads holding it open,
                isolates unused surface, and ranks reversible hardening decisions.
              </p>
              <p className="mono mt-4 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Rajvardhan Patil · competition build
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <div className="grid grid-cols-2 border-y border-border">
              <div className="border-r border-border p-5 sm:p-6">
                <p className="label-caps text-muted-foreground">System</p>
                <p className="mono mt-3 text-sm">{meta.kernel_release}</p>
                <p className="mono mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{meta.arch}</p>
              </div>
              <div className="p-5 sm:p-6">
                <p className="label-caps text-muted-foreground">Evidence</p>
                <p className="mono mt-3 text-sm">{meta.ran_as_root ? "root" : "partial"}</p>
                <p className="mono mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{meta.trace_backend ?? "no tracer"}</p>
              </div>
            </div>
            <p className="mt-6 max-w-md text-xs leading-6 text-muted-foreground">
              The interface is intentionally calm. The security signal lives in attribution,
              reachability, provenance, and counterfactual planning—not decorative chrome.
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Report sections" className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV.map((n, index) => (
              <a
                key={n.href}
                href={n.href}
                className="mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {String(index + 1).padStart(2, "0")} {n.label}
              </a>
            ))}
          </nav>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 border border-border bg-background px-3 py-2 text-[10px] uppercase tracking-[0.08em] transition hover:border-foreground"
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
              className="inline-flex items-center gap-2 border border-foreground bg-foreground px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-background transition hover:opacity-85 disabled:opacity-50"
            >
              <FileDown className="size-3.5" aria-hidden />
              {pdfState === "working"
                ? "Building PDF…"
                : pdfState === "error"
                  ? "Retry PDF"
                  : "Download hardening PDF"}
            </button>
          </div>
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

        {failure ? (
          <LoadErrorPanel
            failure={failure}
            onDismiss={onDismissFailure}
            onRetry={() => inputRef.current?.click()}
          />
        ) : null}

        <div className="mt-14 grid gap-0 border-y border-border sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="total surface weight"
            value={fmt(score.total_surface_weight)}
            hint="all discovered kernel surface"
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
            hint="exposed to an unprivileged local user"
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
            hint="reachable weight touched by nothing observed"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
          <MetaItem label="distro" value={meta.distro} />
          <MetaItem label="collected" value={fmtCollectedAt(meta.collected_at)} />
          <MetaItem label="trace" value={`${meta.trace_backend ?? "n/a"} / ${meta.trace_seconds}s`} />
          <MetaItem label="ksl" value={meta.ksl_version} />
          <MetaItem label="source" value={sourceLabel} />
        </div>

        {meta.skipped && meta.skipped.length > 0 ? (
          <div className="mt-4 border border-border bg-background/70 px-4 py-3 text-xs">
            <p className="mono text-[10px] uppercase tracking-[0.1em] text-foreground">
              partial data · {meta.skipped.length} source(s) skipped
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {meta.skipped.map((s, i) => (
                <li key={`${s.source}-${i}`}>
                  {s.source ?? "unknown source"}: {s.reason ?? "no reason given"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </header>
  );
}
