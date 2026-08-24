import { createFileRoute, Link } from "@tanstack/react-router";
import { Section } from "@/components/ksl/primitives";

const TITLE = "Prior art — what ksl does that existing tools do not";
const DESCRIPTION =
  "Lynis, kernel-hardening-checker, kconfig-hardened-check, Falco and CVE scanners each answer a different question. Where Kernel Surface Ledger sits, and what it deliberately does not duplicate.";

export const Route = createFileRoute("/prior-art")({
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
  component: PriorArt,
});

const TOOLS = [
  {
    name: "kconfig-hardened-check / kernel-hardening-checker",
    answers: "Is this kernel built with the recommended hardening options?",
    gap: "Config-only and host-blind. It cannot tell you whether an option matters on this machine, who is using the surface it leaves open, or what would break if you changed it.",
  },
  {
    name: "Lynis / CIS benchmarks",
    answers: "Does this host match a checklist of accepted practice?",
    gap: "A flat pass/fail list with no reachability model and no ordering. Every item weighs the same, so operators triage by guessing.",
  },
  {
    name: "CVE scanners (Trivy, Grype, vendor feeds)",
    answers: "Which known vulnerabilities apply to the installed kernel version?",
    gap: "Version matching, not exposure. A CVE in a module that cannot be autoloaded on this host scores the same as one any local user can reach.",
  },
  {
    name: "Falco / auditd / Tetragon",
    answers: "What is happening on this host right now?",
    gap: "Runtime detection, not surface reduction. They tell you a syscall was used; they do not tell you which surface nothing has used and could therefore be removed for free.",
  },
  {
    name: "seccomp profile generators (oci-seccomp-bpf-hook, docker-slim)",
    answers: "Which syscalls does this one container need?",
    gap: "Per-container and per-syscall. No host-level attribution, no CVE weighting, no cross-workload sharing analysis, no ranked plan.",
  },
] as const;

function PriorArt() {
  return (
    <main>
      <header className="mx-auto max-w-[1400px] px-4 pb-8 pt-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Prior art, and the gap
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The Linux hardening space is not empty, and pretending otherwise would be the fastest way
          to lose a security-competent reviewer. Each tool below is good at the question it asks.
          None of them asks who is holding the surface open, or what is safe to remove because
          nothing touches it.
        </p>
      </header>

      <Section id="tools" label="01 / landscape" title="What exists">
        <div className="space-y-3">
          {TOOLS.map((t) => (
            <div key={t.name} className="border border-border bg-surface p-4">
              <h3 className="text-sm font-bold text-foreground">{t.name}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground">
                <span className="text-muted-foreground">asks: </span>
                {t.answers}
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                <span className="text-amber">gap: </span>
                {t.gap}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="delta"
        label="02 / the delta"
        title="Three things ksl adds"
        lede="Each is checkable against the report, not a claim about ambition."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-amber-dim bg-surface p-4">
            <h3 className="text-sm font-bold text-amber">Attribution</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Reachable surface is divided across the live workloads that touch it, with sole-owned
              surface separated from shared. Hardening becomes a conversation about a specific
              service, not about the host in the abstract.
            </p>
          </div>
          <div className="border border-orphan/40 bg-surface p-4">
            <h3 className="text-sm font-bold text-orphan">Orphaned surface</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              Surface that is present, unprivileged-reachable, and touched by nothing during the
              observation window. Removing it has provably zero functional impact, which makes it
              the only hardening nobody has to argue about.
            </p>
          </div>
          <div className="border border-border bg-surface p-4">
            <h3 className="text-sm font-bold text-foreground">Counterfactual plan</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              A ranked, reversible plan from a weighted set cover — CVE mass killed per unit of
              predicted breakage — with the artifact, the detection command and the revert attached
              to every step.
            </p>
          </div>
        </div>
      </Section>

      <Section id="scope" label="03 / scope" title="What ksl deliberately is not">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-foreground">
          <p>
            Not a CVE database, not a runtime detector, not a config linter, and not a kernel
            module. It consumes those categories' outputs where useful and answers the question none
            of them do.
          </p>
          <p className="text-muted-foreground">
            The measurement limits are stated in full on the{" "}
            <Link to="/how-it-works" className="text-amber underline">
              method page
            </Link>
            , because a hardening tool that overclaims gets uninstalled the first time it breaks
            production.
          </p>
        </div>
      </Section>
    </main>
  );
}
