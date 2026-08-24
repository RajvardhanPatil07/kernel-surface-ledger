import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import demoReport from "@/data/demo-report.json";
import { validateReport } from "@/lib/ksl-report";
import { groundingContext } from "@/lib/ksl-summary";
import type { KslReport } from "@/lib/ksl-types";
import { AskPanel } from "@/components/ksl/AskPanel";
import { GatesTable } from "@/components/ksl/GatesTable";
import { HeaderBand } from "@/components/ksl/HeaderBand";
import { ImpactGraph } from "@/components/ksl/ImpactGraph";
import type { LoadFailure } from "@/components/ksl/LoadErrorPanel";

import { LedgerTable } from "@/components/ksl/LedgerTable";
import { OrphanedGrid } from "@/components/ksl/OrphanedGrid";
import { PlanSteps } from "@/components/ksl/PlanSteps";
import { Provenance } from "@/components/ksl/Provenance";
import { Section } from "@/components/ksl/primitives";

const TITLE = "Kernel Surface Ledger — who owns your kernel attack surface";
const DESCRIPTION =
  "ksl attributes Linux kernel attack surface to the live workloads holding it open, finds surface nothing touches, and ranks the hardening steps that kill the most reachable CVEs per unit of breakage risk.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

// The bundled demo report renders with zero network calls.
const BUNDLED = demoReport as unknown as KslReport;

const MAX_BYTES = 25 * 1024 * 1024;

function Dashboard() {
  const [report, setReport] = useState<KslReport>(BUNDLED);
  const [sourceLabel, setSourceLabel] = useState("bundled demo scan");
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [dragging, setDragging] = useState(false);

  // No auto-fetch: there is no server route serving scans, and probing one
  // makes the host return a 500 that surfaces as a runtime error. The bundled
  // demo scan is the default; use the file picker / drag-drop for a live one.

  const loadFile = useCallback(async (file: File) => {
    const fail = (kind: LoadFailure["kind"], detail: string) =>
      setFailure({ kind, fileName: file.name || "dropped file", detail });

    setFailure(null);

    const looksJson =
      file.type === "application/json" || /\.json$/i.test(file.name) || file.type === "";
    if (!looksJson) {
      fail("not-json-file", `type "${file.type}" is not JSON`);
      return;
    }
    if (file.size === 0) {
      fail("empty", "0 bytes on disk");
      return;
    }
    if (file.size > MAX_BYTES) {
      fail("too-large", `${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 25 MB limit`);
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      fail("bad-json", err instanceof Error ? err.message : "the file could not be read");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (err) {
      fail("bad-json", err instanceof Error ? err.message : "JSON.parse failed");
      return;
    }

    const result = validateReport(parsed);
    if (!result.ok) {
      fail("bad-schema", result.reason);
      return;
    }

    setReport(result.report);
    setSourceLabel(file.name);
  }, []);

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
          void loadFile(file);
        } else {
          setFailure({
            kind: "not-json-file",
            fileName: "dropped item",
            detail: "no file was in the drop — folders and browser tabs cannot be read",
          });
        }
      }}
      className="min-h-screen bg-background"
    >
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <p className="border border-amber px-6 py-4 text-sm text-amber">
            drop a report.json to render it
          </p>
        </div>
      ) : null}

      <HeaderBand
        report={report}
        sourceLabel={sourceLabel}
        onLoadFile={(f) => void loadFile(f)}
        failure={failure}
        onDismissFailure={() => setFailure(null)}
      />

      <Section
        id="ask"
        label="00 / interrogate"
        title="Ask this report"
        lede="The narration layer, live and grounded: it answers from the loaded JSON, cites element and workload ids, and names what the data cannot tell you rather than guessing."
      >
        <AskPanel context={groundingContext(report)} report={report} />
      </Section>

      <Section
        id="ledger"
        label="01 / attribution"
        title="Surface Debt Ledger"
        lede={
          <>
            Dangerous kernel surface is a jointly held liability across every live workload on the
            host. Each row is one workload&apos;s share: its debt, its marginal contribution, the
            surface it alone keeps open, and the CVE mass that surface exposes. Expand a row for the
            causal narration. The last row is the point.
          </>
        }
      >
        <LedgerTable report={report} />
      </Section>

      <Section
        id="orphaned"
        label="02 / free hardening"
        title="Orphaned surface"
        lede="Present, reachable by any unprivileged local user, and used by nothing during the observation window. Removing it is provably zero-impact — nothing touches it."
      >
        <OrphanedGrid report={report} />
      </Section>

      <Section
        id="gates"
        label="03 / reachability, not mere presence"
        title="Three-tier gates"
        lede="A CVE in a module that cannot be loaded is irrelevant; one reachable by any local user is critical. Every element passes present → reachable_unpriv → used, and module autoload turns 'not loaded' into one socket() call away."
      >
        <GatesTable report={report} />
      </Section>

      <Section
        id="plan"
        label="04 / counterfactual"
        title="Hardening plan"
        lede="Hardening as weighted set cover: the changes that neutralize maximum reachable CVE mass per unit of estimated breakage. Not an unranked findings list — an ordered plan, each step shipping an artifact, a breakage prediction, a detection command and a revert."
      >
        <PlanSteps report={report} />
      </Section>

      <Section
        id="impact"
        label="05 / blast radius"
        title="Impact graph"
        lede="Before you apply a step, see what it touches: each hardening step, the exact kernel surface it removes, and the kernel capability plus the user-space workloads that depend on that surface. Click any node to isolate its paths."
      >
        <ImpactGraph report={report} />
      </Section>

      <Section
        id="provenance"
        label="06 / provenance"
        title="Where the AI is — and is not"
        lede="The scoring engine is fully deterministic. The model explains and generates; it never decides."
      >
        <Provenance report={report} />
      </Section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-[1400px] px-4 text-[11px] text-muted-foreground sm:px-6">
          Kernel Surface Ledger (ksl) — kernel attack surface as an accountability problem. Reports
          are rendered from the frozen report.schema.json contract; drag any schema-valid
          report.json onto this page.
        </div>
      </footer>
    </main>
  );
}
