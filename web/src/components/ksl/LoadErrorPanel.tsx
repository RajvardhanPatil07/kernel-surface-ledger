import { AlertTriangle, RotateCcw, X } from "lucide-react";

export type LoadFailureKind = "not-json-file" | "empty" | "too-large" | "bad-json" | "bad-schema";

export type LoadFailure = {
  kind: LoadFailureKind;
  fileName: string;
  detail: string;
};

const HEADLINE: Record<LoadFailureKind, string> = {
  "not-json-file": "That file is not a JSON report",
  empty: "That file is empty",
  "too-large": "That file is too large to render",
  "bad-json": "That file is not valid JSON",
  "bad-schema": "That JSON is not a ksl report",
};

const STEPS: Record<LoadFailureKind, string[]> = {
  "not-json-file": [
    "Drop the report.json file itself, not a folder, archive or terminal log.",
    "If you exported with a different extension, rename it to end in .json.",
  ],
  empty: [
    "The scan probably failed before writing output — re-run it and check its exit code.",
    "Confirm the file has content: wc -c report.json",
  ],
  "too-large": [
    "Reports above 25 MB are almost always concatenated runs or raw trace dumps.",
    "Render a single scan's report.json, or trim the trace with jq before dropping it.",
  ],
  "bad-json": [
    "The file was likely truncated mid-write, or contains log lines above the JSON.",
    "Validate it first: jq . report.json — jq points at the exact offset that breaks.",
    "Re-run the scan redirecting only stdout: ksl scan --json > report.json",
  ],
  "bad-schema": [
    "This page renders the frozen report.schema.json contract — the field above is missing or the wrong type.",
    "Check the producing version matches this dashboard: ksl --version",
    "Validate against the contract: ksl validate report.json",
  ],
};

export function LoadErrorPanel({
  failure,
  onDismiss,
  onRetry,
}: {
  failure: LoadFailure;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mt-4 border border-destructive/60 bg-surface px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-destructive">{HEADLINE[failure.kind]}</p>

          <p className="mt-1 break-all text-xs text-muted-foreground">
            <span className="text-foreground">{failure.fileName}</span> — {failure.detail}
          </p>

          <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            how to fix it
          </p>
          <ul className="mt-1 space-y-1 text-xs leading-relaxed text-foreground">
            {STEPS[failure.kind].map((step) => (
              <li key={step} className="flex gap-2">
                <span className="text-destructive" aria-hidden>
                  &rarr;
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 border border-amber px-2.5 py-1 text-xs text-amber transition-colors hover:bg-amber/10"
            >
              <RotateCcw className="size-3" aria-hidden />
              Choose another file
            </button>
            <span className="text-[11px] text-muted-foreground">
              nothing was lost — the previously loaded report is still on screen
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
