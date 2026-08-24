import { RotateCcw, Search, TerminalSquare } from "lucide-react";
import { useMemo } from "react";
import { Chip, CodeBlock, RiskBadge } from "./primitives";
import { NarrateBlock } from "./NarrateBlock";
import { CheckThisPanel } from "./CheckThisPanel";
import { cumulativePlan, fmt } from "@/lib/ksl-report";
import { groundingContext } from "@/lib/ksl-summary";
import type { KslReport } from "@/lib/ksl-types";

export function PlanSteps({ report }: { report: KslReport }) {
  const steps = useMemo(() => [...report.plan].sort((a, b) => a.step - b.step), [report.plan]);
  const cumulative = useMemo(() => cumulativePlan(report), [report]);
  const grounding = useMemo(() => groundingContext(report), [report]);
  const totalKilled = cumulative.at(-1)?.cumulative ?? 0;

  if (steps.length === 0) {
    return (
      <p className="border border-border bg-surface p-4 text-sm text-muted-foreground">
        No plan steps in this report.
      </p>
    );
  }

  return (
    <div>
      {/* Cumulative CVE mass killed across the ordered plan. */}
      <div className="border border-border bg-surface p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          cumulative CVE mass killed
        </p>
        <div className="mt-3 flex items-end gap-1">
          {cumulative.map((c) => (
            <div key={c.step} className="flex-1">
              <div
                className="bg-amber"
                style={{
                  height: `${Math.max(4, (c.cumulative / Math.max(totalKilled, 1)) * 56)}px`,
                }}
                aria-hidden
              />
              <p className="tnum mt-1 text-center text-[11px] text-muted-foreground">
                {c.cumulative}
              </p>
            </div>
          ))}
        </div>
        <p className="tnum mt-2 text-xs text-muted-foreground">
          {steps.length} steps → <span className="text-amber">{totalKilled}</span> reachable CVEs
          neutralized
        </p>
      </div>

      <ol className="mt-6 space-y-5">
        {steps.map((s) => (
          <li key={s.step} className="border border-border bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm text-foreground">
                  <span className="tnum mr-2 text-amber">step {s.step}</span>
                  <span className="font-mono">{s.action}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.targets.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge risk={s.breakage_risk} />
                {s.requires_reboot ? <Chip tone="danger">reboot required</Chip> : null}
                <span className="tnum border border-amber-dim bg-surface-raised px-2 py-0.5 text-[11px] text-amber">
                  {s.cves_killed} CVEs killed
                </span>
                {s.weight_removed !== undefined && s.weight_removed > 0 ? (
                  <span className="tnum border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-muted-foreground">
                    −{fmt(s.weight_removed)} weight
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    what could break
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                    {s.breakage_note ?? "No breakage note in this report."}
                  </p>
                  <NarrateBlock
                    context={grounding}
                    targetKind="plan_step"
                    targetId={String(s.step)}
                    targetLabel={s.action}
                    label="Predict breakage for this host"
                  />
                </div>
                {s.detection ? (
                  <div>
                    <p className="flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      <Search className="size-3" aria-hidden /> detect it worked
                    </p>
                    <CodeBlock content={s.detection} path="detection" copyLabel="Copy" />
                  </div>
                ) : null}
                <div>
                  <p className="flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    <RotateCcw className="size-3" aria-hidden /> revert
                  </p>
                  <CodeBlock content={s.revert} path="revert" copyLabel="Copy" />
                </div>
                <CheckThisPanel report={report} step={s} />
              </div>

              <div>
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <TerminalSquare className="size-3" aria-hidden /> generated artifact
                </p>
                {s.artifact.content ? (
                  <CodeBlock
                    content={s.artifact.content}
                    path={s.artifact.path ?? "artifact"}
                    copyLabel="Copy"
                  />
                ) : (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    no artifact content in this report
                  </p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  generated for review — ksl never applies hardening itself
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
