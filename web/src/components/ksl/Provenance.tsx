import { CodeBlock } from "./primitives";
import type { KslReport } from "@/lib/ksl-types";

export function Provenance({ report }: { report: KslReport }) {
  const explained = report.ledger.filter((r) => r.explanation).length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="border border-border bg-surface p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-amber-dim">
          what the model does
        </p>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-foreground">
          <li>
            <span className="text-amber">Causal narration</span> of each blame edge — why a workload
            needs this surface, what primitive an attacker gains, what the alternative is.
            <span className="ml-1 text-muted-foreground">
              ({explained} of {report.ledger.length} ledger rows narrated here)
            </span>
          </li>
          <li>
            <span className="text-amber">Artifact synthesis</span> — applicable modprobe.d
            blacklists, per-service seccomp-BPF filters, systemd drop-ins, sysctl fragments.
          </li>
          <li>
            <span className="text-amber">Breakage prediction</span> — what could break, how to
            detect it, how to revert it.
          </li>
        </ul>
      </div>

      <div className="border border-border bg-surface p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-amber-dim">
          what the model does not do
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-foreground">
          It never decides. Every weight, gate, debt figure, orphan set and plan ordering on this
          page comes from the deterministic engine. Disabling the model entirely produces
          byte-identical scored output — this is enforced by a test in the repository.
        </p>
        <div className="mt-3">
          <CodeBlock
            path="verify determinism"
            content={
              "python ksl.py scan --raw fixtures/raw-demo.json --no-explain\npython ksl.py check report.json"
            }
          />
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Collector is strictly read-only: it never loads or unloads a module, never writes outside
          its output path, and degrades to a partial report as a non-root user. Report produced by
          ksl {report.meta.ksl_version}.
        </p>
      </div>
    </div>
  );
}
