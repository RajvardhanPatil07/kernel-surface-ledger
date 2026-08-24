import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { generateNarration } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live narration for one target. The figures are never touched — this only
 * asks the model to explain or predict, and it is explicit about that.
 */
export function NarrateBlock({
  context,
  targetKind,
  targetId,
  targetLabel,
  scanId,
  label,
}: {
  context: string;
  targetKind: "workload" | "plan_step";
  targetId: string;
  targetLabel: string;
  scanId?: string | undefined;
  label: string;
}) {
  const narrate = useServerFn(generateNarration);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  const mutation = useMutation({
    mutationFn: () =>
      narrate({
        data: { context, targetKind, targetId, targetLabel, ...(scanId ? { scanId } : {}) },
      }),
  });

  if (signedIn === false) {
    return (
      <p className="mt-3 border border-border bg-surface-raised px-3 py-2 text-[11px] text-muted-foreground">
        <Link to="/auth" className="text-amber underline">
          Sign in
        </Link>{" "}
        to run the narration layer live against this report.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 border border-amber-dim px-2 py-1 text-[11px] text-amber transition-colors hover:bg-surface-raised disabled:opacity-50"
      >
        <Sparkles className="size-3" aria-hidden />
        {mutation.isPending ? "asking the model…" : label}
      </button>

      {mutation.isError ? (
        <p className="mt-2 border border-destructive/50 px-3 py-2 text-[11px] text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "the model call failed"} — the
          deterministic figures above are unaffected.
        </p>
      ) : null}

      {mutation.data ? (
        <div className="mt-2 border-l-2 border-amber-dim bg-surface-raised px-3 py-2">
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
            {mutation.data.text}
          </p>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            generated live · {mutation.data.model} · narration only, no figure was computed by the
            model
          </p>
        </div>
      ) : null}
    </div>
  );
}
