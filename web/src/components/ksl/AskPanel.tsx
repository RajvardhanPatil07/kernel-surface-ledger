import { useEffect, useRef, useState } from "react";
import { checkClaims } from "@/lib/claim-check";
import type { KslReport } from "@/lib/ksl-types";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Automatic regression check on the answer: every figure and id the model
 * states is compared against the deterministic report before the reader trusts
 * it. Divergence is shown, not hidden.
 */
function ClaimAudit({ report, text }: { report: KslReport; text: string }) {
  const audit = checkClaims(report, text);
  if (audit.verdict === "no-claims") return null;
  const bad = audit.claims.filter((c) => !c.ok);

  return (
    <div className="mt-2">
      <p
        className={`text-[10px] uppercase tracking-[0.16em] ${
          audit.verdict === "verified" ? "text-amber" : "text-destructive"
        }`}
      >
        {audit.verdict === "verified"
          ? `✓ ${audit.claims.length} claims checked against the report — all match`
          : `✕ ${bad.length} of ${audit.claims.length} claims do not match the report`}
      </p>
      {bad.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {bad.map((c) => (
            <li key={`${c.kind}-${c.claimed}`} className="text-[11px] text-destructive">
              “{c.claimed}” — {c.note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const SUGGESTIONS = [
  "Which single change removes the most reachable CVE mass, and what could it break?",
  "What is reachable here that nothing is using, and why is removing it safe?",
  "Which workload is the most expensive to keep, and what would I lose without it?",
  "What can this report NOT tell me about this host?",
];

const HEADINGS = [
  "ANSWER",
  "WHY",
  "IN PLAIN TERMS",
  "WHAT IT COULD BREAK",
  "CHECK IT",
  "REVERT IT",
];

/**
 * The prompt asks for labelled sections; render those labels so a reader can
 * find the decision, the evidence, the risk and the verification at a glance.
 */
function AnswerBody({ text, streaming }: { text: string; streaming: boolean }) {
  if (!text) {
    return <p className="mt-1 text-[13px] text-muted-foreground">{streaming ? "…" : ""}</p>;
  }

  return (
    <div className="mt-1 space-y-1.5">
      {text.split("\n").map((line, i) => {
        const heading = HEADINGS.find((h) => line.toUpperCase().startsWith(`${h}:`));
        if (heading) {
          return (
            <p key={i} className="text-[13px] leading-relaxed text-foreground">
              <span className="mr-2 text-[10px] uppercase tracking-[0.16em] text-amber">
                {heading.toLowerCase()}
              </span>
              {line.slice(heading.length + 1).trim()}
            </p>
          );
        }
        return (
          <p key={i} className="text-[13px] leading-relaxed text-foreground">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Grounded Q&A over the active report. Streams from /api/ai/ask while the
 * model key remains on the server.
 */
export function AskPanel({ context, report }: { context: string; report: KslReport }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError(null);
    setQuestion("");
    const history = turns;
    setTurns([...history, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, context, history }),
      });

      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || `the model endpoint returned ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
      }
      if (!acc.trim()) {
        setError(
          "The model provider dropped this request without writing anything (the free tier does that when it is overloaded). Nothing is wrong with your question — ask it again.",
        );
        setTurns((prev) => prev.slice(0, -1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "the model call failed");
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="border border-border bg-surface">
      <div ref={logRef} className="max-h-80 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <div>
            <p className="text-sm text-muted-foreground">
              Grounded in the loaded report only. If the answer is not in the data, it says what is
              missing instead of inventing it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="border border-border px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "" : "border-l-2 border-amber-dim pl-3"}>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t.role === "user" ? "you" : "narration layer"}
              </p>
              {t.role === "assistant" ? (
                <>
                  <AnswerBody text={t.content} streaming={streaming} />
                  {t.content.trim() && !(streaming && i === turns.length - 1) ? (
                    <ClaimAudit report={report} text={t.content} />
                  ) : null}
                </>
              ) : (
                <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                  {t.content}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {error ? (
        <p className="mx-4 mb-3 border border-destructive/50 px-3 py-2 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="flex gap-2 border-t border-border p-3"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="ask about this report…"
          className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-amber-dim"
        />
        <button
          type="submit"
          disabled={streaming || !question.trim()}
          className="border border-amber-dim px-3 py-2 text-sm text-amber transition-colors hover:bg-surface-raised disabled:opacity-40"
        >
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
