import { createFileRoute, Link } from "@tanstack/react-router";
import { Section } from "@/components/ksl/primitives";

const TITLE = "Submission — ksl for Track 1, AI at OS & kernel level";
const DESCRIPTION =
  "Kernel Surface Ledger submitted to Track 1: an AI-assisted kernel attack surface analyzer that attributes surface to workloads, finds surface nothing uses, and ships a ranked reversible hardening plan.";

export const Route = createFileRoute("/submission")({
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
  component: Submission,
});

const REQUIREMENTS = [
  {
    ask: "Analyze kernel configurations",
    how: "Parses /boot/config-* and the runtime sysctl set, gating each option by whether it is actually reachable on this host rather than comparing against a static recommended list.",
  },
  {
    ask: "Analyze loaded kernel modules",
    how: "Enumerates available modules via modules.dep, not just loaded ones, and treats unprivileged autoload triggers as reachability — the case config linters miss.",
  },
  {
    ask: "Analyze system calls",
    how: "Observes real syscall usage per workload through the trace backend for a fixed window, which is what makes attribution and the orphan class possible at all.",
  },
  {
    ask: "Analyze exposed kernel interfaces",
    how: "Device nodes, namespaces, capabilities, LSM state and sysctls, each carrying its gate reason and CVE clusters.",
  },
  {
    ask: "Identify potential security weaknesses",
    how: "Weighted reachable surface with CVE cluster mapping, split into three tiers so a reviewer can separate exposure from presence.",
  },
  {
    ask: "AI capability, integrated",
    how: "The model narrates attribution causally, predicts host-specific breakage, and synthesises each hardening artifact and its revert. Scoring stays deterministic — the ledger is reproducible with --no-explain.",
  },
] as const;

function Submission() {
  return (
    <main>
      <header className="mx-auto max-w-[1400px] px-4 pb-8 pt-10 sm:px-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-dim">
          Track 1 / AI usage at OS &amp; kernel level
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Kernel Surface Ledger
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground">
          Kernel attack surface is treated as an accountability problem, not a checklist. ksl
          answers three questions no existing tool answers together:{" "}
          <span className="text-amber">who</span> holds the dangerous surface open,{" "}
          <span className="text-amber">what</span> is reachable but used by nothing, and{" "}
          <span className="text-amber">which</span> reversible changes kill the most reachable CVE
          mass per unit of breakage risk.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          <Link
            to="/"
            className="border border-amber-dim px-3 py-1.5 text-amber transition-colors hover:bg-surface"
          >
            Open the live dashboard →
          </Link>
          <a
            href="https://github.com/RajvardhanPatil07/kernel-surface-ledger"
            target="_blank"
            rel="noreferrer"
            className="border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
          >
            Source on GitHub ↗
          </a>
        </div>
      </header>

      <Section
        id="sixty"
        label="01 / the pitch"
        title="Sixty seconds"
        lede="What a reviewer should take away before opening anything else."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-border bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">problem</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Every hardening tool produces a flat list of things that are true about a kernel. None
              of them says which of those things this host is actually paying for, so operators
              either apply nothing or apply a blanket profile and break production.
            </p>
          </div>
          <div className="border border-amber-dim bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-amber-dim">insight</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Surface only matters when it is reachable, and it is only defensible when something
              uses it. Trace what workloads touch, attribute the rest, and a large fraction of a
              typical host's reachable surface turns out to be held by nobody.
            </p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">result</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              A ledger naming the owner of every unit of reachable surface, an orphan set removable
              at zero functional cost, and a ranked plan where each step ships its artifact, its
              detection command and its revert.
            </p>
          </div>
        </div>
      </Section>

      <Section id="requirements" label="02 / track fit" title="Against the problem statement">
        <div className="overflow-x-auto border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left">
                <th className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  asked for
                </th>
                <th className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  how ksl does it
                </th>
              </tr>
            </thead>
            <tbody>
              {REQUIREMENTS.map((r) => (
                <tr key={r.ask} className="border-b border-border last:border-0">
                  <td className="w-56 px-3 py-3 align-top text-foreground">{r.ask}</td>
                  <td className="px-3 py-3 align-top leading-relaxed text-muted-foreground">
                    {r.how}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="ai"
        label="03 / where the AI is"
        title="Load-bearing, and bounded"
        lede="The most common failure of an AI security tool is a model that quietly invents the numbers."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="border border-amber-dim bg-surface p-4">
            <h3 className="text-sm font-bold text-amber">The model does</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
              <li>Explain causally why a workload holds the surface attributed to it.</li>
              <li>Predict what a hardening step would break on this specific host.</li>
              <li>
                Synthesise the artifact for each step — blacklist, sysctl drop-in, seccomp profile.
              </li>
              <li>
                Write the matching revert, and answer free-form questions grounded in the report.
              </li>
            </ul>
          </div>
          <div className="border border-border bg-surface p-4">
            <h3 className="text-sm font-bold text-foreground">The model does not</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Score, weight or rank anything.</li>
              <li>Decide reachability, ownership or orphan status.</li>
              <li>Choose the plan order — that is a weighted set cover.</li>
              <li>Produce any number that appears on the dashboard.</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Determinism claim, checkable: running with <code>--no-explain</code> yields byte-identical
          scored output. Read the full stage boundary on the{" "}
          <Link to="/pipeline" className="text-amber underline">
            pipeline page
          </Link>
          .
        </p>
      </Section>

      <Section id="honesty" label="04 / limits" title="Stated up front">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-foreground">
          <p>
            ksl is userspace: it reads the kernel's interfaces from outside rather than running in
            kernel context. "Used" means used during the observation window, so a nightly job can
            look orphaned at noon. Without a working trace backend the attribution half degrades to
            everything-unused, and the report says so instead of hiding it.
          </p>
          <p className="text-muted-foreground">
            The complete list, with the failure mode of each gate, is on the{" "}
            <Link to="/how-it-works" className="text-amber underline">
              method page
            </Link>
            , and the comparison against existing tools is on{" "}
            <Link to="/prior-art" className="text-amber underline">
              prior art
            </Link>
            .
          </p>
        </div>
      </Section>
    </main>
  );
}
