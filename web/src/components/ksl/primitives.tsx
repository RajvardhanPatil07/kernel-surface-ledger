import { Check, Copy, Minus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { KslBreakageRisk } from "@/lib/ksl-types";

export function Section({
  id,
  label,
  title,
  lede,
  children,
}: {
  id: string;
  label: string;
  title: string;
  lede?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-12">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-dim">{label}</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        {lede ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{lede}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function Figure({
  label,
  value,
  projected,
  emphasis = false,
  hint,
}: {
  label: string;
  value: string;
  projected?: string | undefined;
  emphasis?: boolean | undefined;
  hint?: string | undefined;
}) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-3 flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "tnum text-3xl font-bold leading-none sm:text-4xl",
            emphasis ? "text-amber" : "text-foreground",
          )}
        >
          {value}
        </span>
        {projected ? (
          <span className="tnum text-sm text-muted-foreground">
            <span aria-hidden>→ </span>
            <span className="sr-only">after plan </span>
            <span className="text-ok">{projected}</span>
          </span>
        ) : null}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "orphan" | "ok" | "danger" | undefined;
  title?: string | undefined;
}) {
  const tones: Record<string, string> = {
    neutral: "border-border bg-surface-raised text-muted-foreground",
    amber: "border-amber-dim bg-surface-raised text-amber",
    orphan: "border-orphan/40 bg-surface-raised text-orphan",
    ok: "border-ok/40 bg-surface-raised text-ok",
    danger: "border-destructive/50 bg-surface-raised text-destructive",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] leading-tight",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const RISK_TONE: Record<string, string> = {
  none: "border-risk-none/50 text-risk-none",
  low: "border-risk-low/50 text-risk-low",
  medium: "border-risk-medium/50 text-risk-medium",
  high: "border-risk-high/60 text-risk-high",
};

export function RiskBadge({ risk }: { risk: KslBreakageRisk }) {
  const tone = RISK_TONE[String(risk).toLowerCase()] ?? RISK_TONE["medium"];
  return (
    <span
      className={cn(
        "inline-flex items-center border bg-surface-raised px-2 py-0.5 text-[11px] uppercase tracking-[0.12em]",
        tone,
      )}
    >
      breakage: {risk}
    </span>
  );
}

/** Unambiguous glyph for a schema boolean — never colour alone. */
export function BoolGlyph({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        value ? "text-amber" : "text-muted-foreground",
      )}
    >
      {value ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Minus className="size-3.5" aria-hidden />
      )}
      <span className="sr-only">
        {label}: {value ? "yes" : "no"}
      </span>
      <span aria-hidden>{value ? "yes" : "no"}</span>
    </span>
  );
}

export function WeightBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span
      className="ml-2 inline-block h-1.5 w-16 bg-grid align-middle"
      role="presentation"
      aria-hidden
    >
      <span className="block h-full bg-amber" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function CodeBlock({
  content,
  path,
  copyLabel = "Copy",
}: {
  content: string;
  path?: string | undefined;
  copyLabel?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-2 py-1">
        <span className="truncate text-[11px] text-muted-foreground">{path ?? "artifact"}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
        >
          {copied ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <Copy className="size-3" aria-hidden />
          )}
          {copied ? "Copied" : copyLabel}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto p-3 text-[11.5px] leading-relaxed text-foreground">
        <code>{content}</code>
      </pre>
    </div>
  );
}

export function NotCollected({ reason }: { reason?: string | undefined }) {
  return (
    <span className="text-xs italic text-muted-foreground">
      not collected{reason ? ` — ${reason}` : ""}
    </span>
  );
}
