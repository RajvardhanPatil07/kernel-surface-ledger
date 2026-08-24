import { Check, ClipboardCopy, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { stepChecks } from "@/lib/ksl-checks";
import type { KslPlanStep, KslReport } from "@/lib/ksl-types";

/**
 * "Check this" — every plan step turned into copyable commands with a
 * beginner-readable reading of the output. No kernel knowledge required.
 */
export function CheckThisPanel({ report, step }: { report: KslReport; step: KslPlanStep }) {
  const checks = useMemo(() => stepChecks(report, step), [report, step]);
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      window.setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  };

  const all = checks.map((c) => c.command).join("\n");

  return (
    <div className="border border-border bg-surface-raised">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <ShieldCheck className="size-3" aria-hidden /> check this — did step {step.step} work?
        </p>
        <button
          type="button"
          onClick={() => void copy(all, -1)}
          className="inline-flex items-center gap-1 border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
        >
          {copied === -1 ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <ClipboardCopy className="size-3" aria-hidden />
          )}
          Copy all {checks.length}
        </button>
      </div>

      <ol className="divide-y divide-border">
        {checks.map((c, i) => (
          <li key={`${c.command}-${i}`} className="px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] text-foreground">
                <span className="tnum mr-2 text-amber">{i + 1}</span>
                {c.label}
              </p>
              <button
                type="button"
                onClick={() => void copy(c.command, i)}
                aria-label={`Copy command ${i + 1}`}
                className="shrink-0 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
              >
                {copied === i ? "copied" : "copy"}
              </button>
            </div>
            <pre className="mt-1.5 overflow-x-auto border border-border bg-background px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
              <code>$ {c.command}</code>
            </pre>
            <p className="mt-1.5 flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Check className="mt-0.5 size-3 shrink-0 text-amber" aria-hidden />
              <span>
                <span className="text-foreground">good:</span> {c.pass}
              </span>
            </p>
            <p className="mt-1 flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" aria-hidden />
              <span>
                <span className="text-foreground">not good:</span> {c.fail}
              </span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
