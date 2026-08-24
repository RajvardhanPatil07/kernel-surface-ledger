import { createFileRoute } from "@tanstack/react-router";
import { Section } from "@/components/ksl/primitives";

const TITLE = "Method — three-tier reachability, attribution, set cover | ksl";
const DESCRIPTION =
  "How Kernel Surface Ledger decides what kernel attack surface matters: present vs reachable vs used, module autoload, surface debt attribution, weighted set cover, and the limits of the measurement.";

export const Route = createFileRoute("/how-it-works")({
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
  component: HowItWorks,
});

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-foreground">{children}</div>
  );
}

function HowItWorks() {
  return (
    <main>
      <header className="mx-auto max-w-[1400px] px-4 pb-8 pt-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          How the ledger is computed
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Nothing on the dashboard is a heuristic score with a hidden constant. Each figure comes
          from a rule you can check against the report JSON, and every rule has a stated failure
          mode.
        </p>
      </header>

      <Section
        id="tiers"
        label="01 / reachability"
        title="Present, reachable, used — three different questions"
        lede="Most auditors conflate them, and that is why their output is unactionable."
      >
        <Body>
          <p>
            <span className="text-amber">present</span> — the element exists in this kernel build or
            on this filesystem: a syscall compiled in, a module available under{" "}
            <code>/lib/modules</code>, a device node in <code>/dev</code>, a sysctl that reads back.
            Presence alone says nothing about risk.
          </p>
          <p>
            <span className="text-amber">reachable_unpriv</span> — an unprivileged local user can
            actually get to it: the syscall is not blocked by seccomp for the processes that matter,
            the device node is mode 0666, the sysctl is writable, the module can be autoloaded. This
            is the tier that turns a CVE from trivia into exposure.
          </p>
          <p>
            <span className="text-amber">used</span> — something on this host touched it during the
            observation window. Reachable and <em>not</em> used is the orphan class: removable with
            provably zero functional impact, because nothing was using it.
          </p>
          <p className="text-muted-foreground">
            A CVE in a module that cannot be loaded is irrelevant. A CVE in a module any local user
            can autoload with a single <code>socket()</code> call is critical. The gate reason for
            each element is carried in the report so the judgement is auditable, not asserted.
          </p>
        </Body>
      </Section>

      <Section
        id="autoload"
        label="02 / the trap"
        title="Module autoload: 'not loaded' is not 'not reachable'"
      >
        <Body>
          <p>
            Kernel module autoloading means an unprivileged process can cause a module to load on
            demand — creating a socket of an obscure family, opening a filesystem type, touching a
            netlink protocol. Tools that enumerate <code>/proc/modules</code> and stop there report
            a clean host while the dangerous module is one syscall away.
          </p>
          <p>
            ksl walks <code>modules.dep</code> for <em>available</em> modules, not just loaded ones,
            and marks anything autoloadable by an unprivileged trigger as reachable. That is why the
            gates table separates <span className="text-amber">present but gated</span> from{" "}
            <span className="text-amber">reachable and unused</span> — the second class is where the
            free wins are.
          </p>
        </Body>
      </Section>

      <Section
        id="attribution"
        label="03 / attribution"
        title="Surface debt: who keeps this open?"
        lede="A host's kernel surface is a jointly held liability. The ledger splits it."
      >
        <Body>
          <p>
            Every workload's syscall, device and capability usage is mapped to the surface elements
            it touches. An element touched by exactly one workload is that workload's{" "}
            <span className="text-amber">sole-owned</span> surface — stop the workload and the
            surface can go. An element touched by several is shared, and its weight is divided
            between them.
          </p>
          <p>
            <span className="text-amber">surface debt</span> is a workload's total share of
            reachable weight. <span className="text-amber">marginal contribution</span> is how much
            reachable weight would disappear if that one workload went away and nothing else changed
            — the number that answers "is this container worth its blast radius?".
          </p>
          <p className="text-muted-foreground">
            The pinned ORPHANED row carries whatever is left: reachable surface no workload claims.
            On most hosts it is the single largest row in the ledger, and it is the row that costs
            nothing to pay off.
          </p>
        </Body>
      </Section>

      <Section id="setcover" label="04 / ranking" title="Hardening as weighted set cover">
        <Body>
          <p>
            Each candidate change (blacklist a module, tighten a sysctl, drop a capability, apply a
            seccomp filter) covers a set of reachable CVE clusters at an estimated breakage cost.
            The plan is a greedy weighted set cover: maximise CVE mass neutralized per unit of
            predicted breakage, then order the steps.
          </p>
          <p>
            The result is a plan, not a findings list. Each step ships the artifact that implements
            it, the command that detects breakage afterwards, and the exact revert. Reversibility is
            not a nicety here — an irreversible hardening step is one nobody applies.
          </p>
        </Body>
      </Section>

      <Section
        id="limits"
        label="05 / honesty"
        title="What this cannot tell you"
        lede="Every limit below is recorded in the report itself rather than papered over."
      >
        <Body>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-foreground">Observation window.</span> "used" means used during
              the trace window. A nightly job that runs at 03:00 looks orphaned at noon. Trace
              longer, or trace repeatedly, before removing surface a workload might need.
            </li>
            <li>
              <span className="text-foreground">Trace backend availability.</span> eBPF tooling is
              frequently missing or broken on a host. When no backend works the report records{" "}
              <code>trace_backend: none</code> and marks everything unused — the attribution half
              degrades honestly instead of lying.
            </li>
            <li>
              <span className="text-foreground">Non-root collection.</span> Without root, some{" "}
              <code>/proc</code> and <code>/sys</code> reads fail. Each one is listed in{" "}
              <code>meta.skipped</code> with its reason, and the dashboard shows a partial-data
              chip.
            </li>
            <li>
              <span className="text-foreground">Userspace collection.</span> ksl reads the kernel's
              own interfaces; it is not a kernel module. It measures the surface the kernel exposes,
              from outside.
            </li>
            <li>
              <span className="text-foreground">CVE clusters, not a CVE database.</span> Elements
              are mapped to clusters of known kernel vulnerability classes. It is a mapping, and it
              is as current as the shipped map.
            </li>
          </ul>
        </Body>
      </Section>
    </main>
  );
}
