import { createFileRoute } from "@tanstack/react-router";
import { CodeBlock, Section } from "@/components/ksl/primitives";

const TITLE = "Pipeline — collector, engine, narrator, report | ksl";
const DESCRIPTION =
  "The four stages of a ksl run: userspace collection, deterministic scoring, the AI narration and artifact layer, and the frozen report.json contract the dashboard renders.";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pipeline,
});

const STAGES = [
  {
    n: "01",
    name: "collect",
    where: "userspace, on the host",
    what: "Reads /proc, /sys, /dev, /boot/config-*, modules.dep and the running process table; optionally attaches an eBPF or ftrace backend to observe syscall usage for a fixed window. Every read that fails is recorded in meta.skipped with its reason.",
    out: "raw facts + a trace window",
    ai: false,
  },
  {
    n: "02",
    name: "score",
    where: "deterministic engine",
    what: "Applies the three reachability gates, weights each element, attributes surface debt across workloads, isolates orphaned surface, and solves the weighted set cover that orders the hardening plan. No model is involved and no randomness is used.",
    out: "score, ledger, orphaned, plan",
    ai: false,
  },
  {
    n: "03",
    name: "narrate",
    where: "LLM layer",
    what: "Takes the already-computed figures and writes the causal explanation per ledger row, predicts what a plan step would break on this specific host, and synthesises the artifact for each step (modprobe blacklist, sysctl drop-in, seccomp profile) plus its revert. It never produces or edits a number.",
    out: "explanation, breakage_note, artifact, revert",
    ai: true,
  },
  {
    n: "04",
    name: "emit",
    where: "report.json",
    what: "Serialises everything against the frozen report.schema.json. The dashboard is a pure function of this file — no hidden state, no server-side computation, and any schema-valid report from any host renders identically.",
    out: "report.json",
    ai: false,
  },
] as const;

function Pipeline() {
  return (
    <main>
      <header className="mx-auto max-w-[1400px] px-4 pb-8 pt-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          One run, four stages
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The boundary that matters is between stage 02 and stage 03: everything numeric is decided
          before the model is called, and everything the model writes is prose or an artifact. Run
          with <code>--no-explain</code> and the scored output is byte-identical.
        </p>
      </header>

      <Section id="stages" label="01 / architecture" title="Stage by stage">
        <ol className="space-y-3">
          {STAGES.map((s) => (
            <li key={s.n} className="border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tnum text-xs text-muted-foreground">{s.n}</span>
                <h3 className="text-base font-bold text-foreground">{s.name}</h3>
                <span className="text-[11px] text-muted-foreground">{s.where}</span>
                <span
                  className={
                    s.ai
                      ? "ml-auto border border-amber-dim px-2 py-0.5 text-[11px] text-amber"
                      : "ml-auto border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                  }
                >
                  {s.ai ? "model in the loop" : "no model"}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground">{s.what}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">→ {s.out}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="run"
        label="02 / operator view"
        title="Running it"
        lede="A scan is one command on the host under audit; the dashboard consumes the file it writes."
      >
        <div className="max-w-3xl space-y-4">
          <CodeBlock
            path="on the host under audit"
            content={`# full run, with the trace backend and narration
sudo ksl scan --trace-seconds 60 --out report.json

# scored output only — no model call, byte-reproducible
sudo ksl scan --trace-seconds 60 --no-explain --out report.json`}
          />
          <CodeBlock
            path="verify the contract before rendering"
            content={`jq -e '.meta.ksl_version and .score.reachable_cve_count' report.json
ksl validate report.json`}
          />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Then drop <code>report.json</code> onto the dashboard to inspect the host directly.
          </p>
        </div>
      </Section>

      <Section id="contract" label="03 / contract" title="Why the schema is frozen">
        <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-foreground">
          <p>
            The report is the interface between a Python collector that must run as root on a Linux
            host and a viewer that must run anywhere. Freezing it means the collector can be
            rewritten — a different trace backend, a wider CVE map — without touching the dashboard,
            and a report captured months ago still renders.
          </p>
          <p className="text-muted-foreground">
            It also means the numbers on screen are checkable. Everything the dashboard displays is
            present in the file; nothing is derived from a server call you cannot inspect.
          </p>
        </div>
      </Section>
    </main>
  );
}
