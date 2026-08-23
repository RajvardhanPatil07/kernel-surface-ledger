#!/usr/bin/env python3
"""Fleet rollup: reduce N schema-valid ksl reports into one summary.

    python scripts/fleet_rollup.py report1.json report2.json [...] [--format markdown|json]

Aggregation is a plain reduce over the frozen contract, exactly as the
README's "From one host to a fleet" section describes: per-host rows are
extracted, weights are summed, CVE clusters and orphaned elements are
unioned. Per-host reachable-CVE counts are summed with an explicit
"not deduplicated" label; the deduplicated figure is the cluster union.
Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_report(path: str) -> dict:
    """Load one report, exiting with a one-line error on failure."""
    try:
        data = json.loads(Path(path).read_text())
    except FileNotFoundError:
        print(f"error: {path} does not exist", file=sys.stderr)
        raise SystemExit(1)
    except json.JSONDecodeError as exc:
        print(f"error: {path} is not valid JSON: {exc}", file=sys.stderr)
        raise SystemExit(1)
    for key in ("meta", "score", "orphaned", "ledger", "surface_elements"):
        if key not in data:
            print(f"error: {path} is missing '{key}' — not a ksl report", file=sys.stderr)
            raise SystemExit(1)
    return data


def top_debt_workload(report: dict) -> tuple[str, float]:
    """Return (comm, debt) of the highest-debt workload, or ("—", 0.0)."""
    rows = report.get("ledger") or []
    if not rows:
        return "—", 0.0
    top = max(rows, key=lambda r: (r.get("surface_debt", 0.0), r.get("workload_id", "")))
    workloads = {w["id"]: w.get("comm", w["id"]) for w in report.get("workloads", [])}
    return str(workloads.get(top["workload_id"], top["workload_id"])), float(
        top.get("surface_debt", 0.0)
    )


def reachable_clusters(report: dict) -> set[str]:
    """Union of CVE clusters over reachable elements."""
    return {
        cluster
        for element in report["surface_elements"]
        if element.get("reachable_unpriv")
        for cluster in element.get("cve_clusters", [])
    }


def rollup(reports: list[tuple[str, dict]], fmt: str) -> str:
    """Render the fleet summary as markdown or json."""
    per_host: list[dict] = []
    orphan_tally: dict[str, int] = {}
    cluster_union: set[str] = set()

    for path, report in reports:
        score = report["score"]
        orphaned = report["orphaned"]
        comm, debt = top_debt_workload(report)
        clusters = reachable_clusters(report)
        cluster_union.update(clusters)
        for eid in orphaned["elements"]:
            orphan_tally[eid] = orphan_tally.get(eid, 0) + 1
        per_host.append(
            {
                "file": Path(path).name,
                "distro": report["meta"]["distro"],
                "kernel": report["meta"]["kernel_release"],
                "reachable_weight": score["reachable_surface_weight"],
                "reachable_cves": score["reachable_cve_count"],
                "orphaned_weight": orphaned["total_weight"],
                "orphan_ratio": score["orphan_ratio"],
                "top_debt_workload": comm,
                "top_debt": debt,
                "reachable_clusters": sorted(clusters),
            }
        )

    total_weight = round(sum(h["reachable_weight"] for h in per_host), 2)
    summary = {
        "hosts": len(reports),
        "reachable_weight_sum": total_weight,
        "reachable_cves_sum_not_deduplicated": sum(h["reachable_cves"] for h in per_host),
        "reachable_cluster_union": sorted(cluster_union),
        "orphaned_union": sorted(
            ({"element": eid, "hosts": n} for eid, n in orphan_tally.items()),
            key=lambda e: (-e["hosts"], e["element"]),
        ),
        "per_host": per_host,
    }

    if fmt == "json":
        return json.dumps(summary, indent=2, sort_keys=True)

    lines = [
        "# ksl fleet rollup",
        "",
        f"hosts: {summary['hosts']}  ·  reachable weight Σ: {total_weight}  ·  "
        f"reachable CVEs Σ (not deduplicated): "
        f"{summary['reachable_cves_sum_not_deduplicated']}  ·  "
        f"deduplicated CVE clusters: {len(cluster_union)}",
        "",
        "| host | kernel | reachable w | cves | orphaned w | ratio | top debtor |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for h in per_host:
        lines.append(
            f"| {h['distro']} | {h['kernel']} | {h['reachable_weight']} "
            f"| {h['reachable_cves']} | {h['orphaned_weight']} "
            f"| {h['orphan_ratio']} | {h['top_debt_workload']} ({h['top_debt']}) |"
        )
    lines += ["", "## fleet-wide orphaned surface (free to remove)", ""]
    if orphan_tally:
        lines += [
            f"- `{eid}` — orphaned on {n}/{summary['hosts']} hosts"
            for eid, n in sorted(orphan_tally.items(), key=lambda kv: (-kv[1], kv[0]))
        ]
    else:
        lines.append("- none: every host has all reachable surface in use")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="fleet_rollup", description=__doc__)
    parser.add_argument("reports", nargs="+", help="paths to report.json files")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args(argv)

    reports = [(path, load_report(path)) for path in args.reports]
    sys.stdout.write(rollup(reports, args.format))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
