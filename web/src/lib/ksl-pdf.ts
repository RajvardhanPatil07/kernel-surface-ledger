/**
 * Client-side hardening report PDF. Every figure comes from the loaded report;
 * nothing here recomputes or interprets. Generated in the browser so no scan
 * data leaves the machine.
 */

import { cumulativePlan, fmt, fmtCollectedAt, fmtPercent } from "./ksl-report";
import { stepChecks } from "./ksl-checks";
import type { KslReport } from "./ksl-types";

const MARGIN = 48;
const LINE = 13;

export async function buildHardeningPdf(report: KslReport, sourceLabel: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const space = (needed = LINE) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const text = (
    value: string,
    opts: { size?: number; bold?: boolean; mono?: boolean; gap?: number } = {},
  ) => {
    doc.setFont(opts.mono ? "courier" : "helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 10);
    const lines = doc.splitTextToSize(value, width) as string[];
    for (const line of lines) {
      space();
      doc.text(line, MARGIN, y);
      y += LINE;
    }
    y += opts.gap ?? 0;
  };

  const rule = () => {
    space(8);
    doc.setDrawColor(180);
    doc.line(MARGIN, y - 8, pageWidth - MARGIN, y - 8);
    y += 4;
  };

  // ---- cover ----------------------------------------------------------------
  text("Kernel Surface Ledger — hardening report", { size: 18, bold: true });
  text(`${report.meta.distro} · kernel ${report.meta.kernel_release} · ${report.meta.arch}`, {
    size: 11,
  });
  text(
    `collected ${fmtCollectedAt(report.meta.collected_at)} · ${report.meta.trace_seconds}s observation · ksl ${report.meta.ksl_version} · source: ${sourceLabel}`,
    { size: 9, gap: 6 },
  );
  rule();

  const projected = report.score.projected_after_plan;
  text("Headline figures", { size: 13, bold: true });
  text(
    [
      `total surface weight: ${fmt(report.score.total_surface_weight)}`,
      `reachable surface weight: ${fmt(report.score.reachable_surface_weight)}${
        projected?.reachable_surface_weight !== undefined
          ? ` -> ${fmt(projected.reachable_surface_weight)} after the plan`
          : ""
      }`,
      `reachable CVEs: ${report.score.reachable_cve_count}${
        projected?.reachable_cve_count !== undefined
          ? ` -> ${projected.reachable_cve_count} after the plan`
          : ""
      }`,
      `orphan ratio: ${fmtPercent(report.score.orphan_ratio)} (weight ${fmt(report.orphaned.total_weight)}, ${report.orphaned.cves_neutralizable} CVEs neutralizable, zero observed users)`,
    ].join("\n"),
    { gap: 6 },
  );

  const cumulative = cumulativePlan(report);
  text(
    `Plan: ${report.plan.length} ordered steps, ${cumulative.at(-1)?.cumulative ?? 0} reachable CVEs neutralized in total.`,
    { gap: 8 },
  );
  rule();

  // ---- plan table -----------------------------------------------------------
  text("Plan summary", { size: 13, bold: true });
  text("step | action | CVEs killed | weight removed | risk | reboot", {
    size: 9,
    bold: true,
  });
  for (const s of [...report.plan].sort((a, b) => a.step - b.step)) {
    text(
      `${s.step} | ${s.action} | ${s.cves_killed} | ${s.weight_removed !== undefined ? fmt(s.weight_removed) : "n/a"} | ${s.breakage_risk} | ${s.requires_reboot ? "yes" : "no"}`,
      { size: 9, mono: true },
    );
  }
  y += 6;
  rule();

  // ---- per-step detail ------------------------------------------------------
  for (const s of [...report.plan].sort((a, b) => a.step - b.step)) {
    space(60);
    text(`Step ${s.step} — ${s.action}`, { size: 13, bold: true });
    text(`targets: ${s.targets.join(", ") || "none listed"}`, { size: 9 });
    text(
      `CVEs killed: ${s.cves_killed} · weight removed: ${s.weight_removed !== undefined ? fmt(s.weight_removed) : "not reported"} · breakage risk: ${s.breakage_risk}${s.requires_reboot ? " · requires reboot" : ""}`,
      { size: 9, gap: 4 },
    );

    text("What could break", { size: 10, bold: true });
    text(s.breakage_note ?? "No breakage note in this report.", { size: 9, gap: 4 });

    if (s.artifact.content) {
      text(`Artifact (${s.artifact.path ?? "artifact"})`, { size: 10, bold: true });
      text(s.artifact.content, { size: 8, mono: true, gap: 4 });
    }

    text("Check commands", { size: 10, bold: true });
    for (const c of stepChecks(report, s)) {
      text(`- ${c.label}`, { size: 9 });
      text(`  $ ${c.command}`, { size: 8, mono: true });
      text(`  pass: ${c.pass}`, { size: 8 });
      text(`  otherwise: ${c.fail}`, { size: 8, gap: 2 });
    }

    text("Revert", { size: 10, bold: true });
    text(s.revert, { size: 8, mono: true, gap: 6 });
    rule();
  }

  // ---- provenance -----------------------------------------------------------
  space(40);
  text("Provenance", { size: 13, bold: true });
  text(
    "All scoring, attribution and step ordering in this report are produced by the deterministic ksl engine. The AI layer only explains findings and drafts artifacts; it never scores, ranks or decides. ksl never applies hardening itself — every command above is for a human to review and run.",
    { size: 9 },
  );

  return doc.output("blob");
}

/** Build the PDF and hand it to the browser as a download. */
export async function downloadHardeningPdf(report: KslReport, sourceLabel: string): Promise<void> {
  const blob = await buildHardeningPdf(report, sourceLabel);
  const stamp = report.meta.collected_at.replace(/[:.]/g, "-").replace(/(T\d\d-\d\d).*/, "$1");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ksl-hardening-${report.meta.kernel_release}-${stamp}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
