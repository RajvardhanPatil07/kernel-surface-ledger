import type { KslReport } from "./ksl-types";

/** Headline figures pulled out of a report so a scan list can be rendered without parsing the blob. */
export interface ScanSummary {
  host_label: string;
  kernel_release: string;
  arch: string;
  distro: string;
  trace_backend: string | null;
  collected_at: string;
  total_surface_weight: number;
  reachable_surface_weight: number;
  reachable_cve_count: number;
  orphan_ratio: number;
}

export function summarize(report: KslReport, hostLabel?: string): ScanSummary {
  const collected = new Date(report.meta.collected_at);
  return {
    host_label: hostLabel?.trim() || `${report.meta.distro} · ${report.meta.kernel_release}`,
    kernel_release: report.meta.kernel_release,
    arch: report.meta.arch,
    distro: report.meta.distro,
    trace_backend: report.meta.trace_backend ?? null,
    collected_at: Number.isNaN(collected.getTime())
      ? new Date().toISOString()
      : collected.toISOString(),
    total_surface_weight: report.score.total_surface_weight,
    reachable_surface_weight: report.score.reachable_surface_weight,
    reachable_cve_count: report.score.reachable_cve_count,
    orphan_ratio: report.score.orphan_ratio,
  };
}

/**
 * A compact, model-facing projection of a report. The full JSON is far larger
 * than a prompt needs and most of it is repetition.
 */
export function groundingContext(report: KslReport): string {
  const lines: string[] = [];
  const m = report.meta;
  lines.push(
    `KERNEL ${m.kernel_release} | arch ${m.arch} | distro ${m.distro} | trace ${m.trace_backend ?? "none"} for ${m.trace_seconds}s | root=${String(m.ran_as_root)}`,
  );
  const s = report.score;
  lines.push(
    `SCORE total_weight=${s.total_surface_weight} reachable_weight=${s.reachable_surface_weight} reachable_cves=${s.reachable_cve_count} orphan_ratio=${s.orphan_ratio}`,
  );

  lines.push(
    "",
    "SURFACE ELEMENTS (id | kind | subsystem | weight | present/reachable_unpriv/used | cves | gate)",
  );
  for (const e of report.surface_elements) {
    lines.push(
      `${e.id} | ${e.kind} | ${e.subsystem ?? "-"} | ${e.weight} | ${[e.present, e.reachable_unpriv, e.used].map((b) => (b ? "1" : "0")).join("/")} | ${e.cve_clusters.join(",") || "-"} | ${e.gate_reason ?? "-"}`,
    );
  }

  lines.push("", "WORKLOADS (id | comm | unit | uid | caps | touches)");
  for (const w of report.workloads) {
    lines.push(
      `${w.id} | ${w.comm} | ${w.unit ?? "-"} | uid=${w.uid ?? "-"} | ${(w.caps_effective ?? []).join(",") || "-"} | ${w.touches.join(",")}`,
    );
  }

  lines.push(
    "",
    "LEDGER (workload_id | surface_debt | marginal | sole_owned | shared | reachable_cves)",
  );
  for (const r of report.ledger) {
    lines.push(
      `${r.workload_id} | ${r.surface_debt} | ${r.marginal_contribution ?? "-"} | ${r.sole_owner_elements.join(",") || "-"} | ${r.shared_elements.join(",") || "-"} | ${r.reachable_cves}`,
    );
  }

  lines.push(
    "",
    `ORPHANED weight=${report.orphaned.total_weight} cves_neutralizable=${report.orphaned.cves_neutralizable} elements=${report.orphaned.elements.join(",")}`,
  );

  lines.push("", "PLAN (step | action | targets | cves_killed | weight_removed | risk | note)");
  for (const p of [...report.plan].sort((a, b) => a.step - b.step)) {
    lines.push(
      `${p.step} | ${p.action} | ${p.targets.join(",")} | ${p.cves_killed} | ${p.weight_removed ?? "-"} | ${p.breakage_risk} | ${p.breakage_note ?? "-"}`,
    );
  }

  return lines.join("\n");
}
