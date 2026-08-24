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
    <section id={id} className="section-shell scroll-mt-24 border-t border-border py-16 sm:py-20">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-5 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 lg:px-10">
        <div className="self-start lg:sticky lg:top-8">
          <p className="label-caps mono text-muted-foreground">{label}</p>
        </div>
        <div>
          <h2 className="display-tight max-w-4xl text-3xl font-semibold leading-[0.95] text-foreground sm:text-4xl lg:text-5xl">
            {title}
          </h2>
          {lede ? (
            <p className="mt-5 max-w-3xl text-sm leading-7 tracking-[0.01em] text-muted-foreground sm:text-[15px]">
              {lede}
            </p>
          ) : null}
          <div className="mt-10">{children}</div>
        </div>
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
    <div className="border-y border-border bg-transparent px-1 py-5 sm:px-2 sm:py-6">
      <p className="label-caps text-muted-foreground">{label}</p>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={cn(
            "display-tight tnum text-5xl font-semibold leading-none sm:text-6xl",
            emphasis ? "text-foreground" : "text-foreground",
          )}
        >
          {value}
        </span>
        {projected ? (
          <span className="tnum mono text-sm text-muted-foreground">
            <span aria-hidden>→ </span>
            <span className="sr-only">after plan </span>
            <span className="text-foreground">{projected}</span>
          </span>
        ) : null}
      </p>
      {hint ? <p className="mt-3 max-w-xs text-[11px] leading-5 text-muted-foreground">{hint}</p> : null}
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
    neutral: "border-border bg-surface text-muted-foreground",
    amber: "border-foreground bg-foreground text-background",
    orphan: "border-orphan/50 bg-surface text-orphan",
    ok: "border-ok/50 bg-surface text-ok",
    danger: "border-destructive/50 bg-surface text-destructive",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-1 text-[10px] uppercase tracking-[0.14em]",
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
        "mono inline-flex items-center border bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.12em]",
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
        value ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {value ? <Check className="size-3.5" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
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
    <span className="ml-2 inline-block h-px w-20 bg-grid align-middle" role="presentation" aria-hidden>
      <span className="block h-full bg-foreground" style={{ width: `${pct}%` }} />
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="mono truncate text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {path ?? "artifact"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="mono inline-flex shrink-0 items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          {copied ? "Copied" : copyLabel}
        </button>
      </div>
      <pre className="mono max-h-72 overflow-auto p-4 text-[11.5px] leading-relaxed text-foreground">
        <code>{content}</code>
      </pre>
    </div>
  );
}

export function NotCollected({ reason }: { reason?: string | undefined }) {
  return <span className="mono text-xs italic text-muted-foreground">not collected{reason ? ` — ${reason}` : ""}</span>;
}
