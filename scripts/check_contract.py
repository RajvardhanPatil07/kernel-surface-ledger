#!/usr/bin/env python3
"""Validate the frozen report contract.

The collector, engine, and dashboard are built in parallel against
report.schema.json, so a drifting schema is the single most expensive failure
mode in this project. This script is the guard rail:

1. report.schema.json is itself a valid Draft 7 schema.
2. fixtures/demo.json satisfies it.
3. data/weights.yaml is well formed, with unique ids and in-range weights.
4. Every element id referenced anywhere in the fixture actually exists.
5. Every derived number recomputes from its documented formula.
6. The orphaned set is exactly what its definition produces.

Run locally with: python scripts/check_contract.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft7Validator

ROOT = Path(__file__).resolve().parent.parent

REMOVABLE_KINDS = {"syscall", "module", "devnode", "namespace", "capability"}
PER_SERVICE_ACTIONS = {"seccomp_filter", "systemd_confine"}


def fail(message: str) -> None:
    """Print a failure and exit non-zero."""
    print(f"FAIL: {message}")
    sys.exit(1)


def check_schema_and_fixture() -> dict:
    """Validate the demo fixture against the frozen schema."""
    schema = json.loads((ROOT / "report.schema.json").read_text())
    report = json.loads((ROOT / "fixtures" / "demo.json").read_text())

    Draft7Validator.check_schema(schema)

    errors = sorted(Draft7Validator(schema).iter_errors(report), key=lambda e: list(e.path))
    if errors:
        for error in errors:
            print(f"  {list(error.path)}: {error.message}")
        fail(f"fixtures/demo.json violates report.schema.json ({len(errors)} errors)")

    print("ok: fixtures/demo.json satisfies report.schema.json")
    return report


def check_weights() -> set[str]:
    """Validate the curated risk table and return the set of known element ids."""
    weights = yaml.safe_load((ROOT / "data" / "weights.yaml").read_text())

    known: set[str] = set()
    for group, entries in weights.items():
        for entry in entries:
            for field in ("id", "name", "kind", "weight"):
                if field not in entry:
                    fail(f"{group}: entry missing '{field}': {entry}")
            if entry["id"] in known:
                fail(f"duplicate element id: {entry['id']}")
            if not 0 <= entry["weight"] <= 10:
                fail(f"{entry['id']}: weight {entry['weight']} outside 0-10")
            known.add(entry["id"])

    print(f"ok: data/weights.yaml defines {len(known)} surface elements")

    cve_map = json.loads((ROOT / "data" / "cve-map.json").read_text())
    referenced = {
        cluster
        for entries in weights.values()
        for entry in entries
        for cluster in entry.get("cve_clusters", [])
    }
    unknown = referenced - set(cve_map)
    if unknown:
        fail(f"weights.yaml references clusters absent from cve-map.json: {sorted(unknown)}")

    for cluster, mapping in cve_map.items():
        if cluster.startswith("_"):
            continue
        if "cves" not in mapping:
            fail(f"cve-map.json: cluster '{cluster}' missing 'cves' list")
        if not isinstance(mapping["cves"], list):
            fail(f"cve-map.json: cluster '{cluster}' has non-list 'cves'")
        for cve in mapping["cves"]:
            if not str(cve).startswith("CVE-"):
                fail(f"cve-map.json: {cluster} carries malformed id '{cve}'")

    print(f"ok: data/cve-map.json covers {len(referenced)} referenced clusters")
    return known


def check_references(report: dict, known: set[str]) -> None:
    """Every element id referenced in the fixture must be defined."""
    element_ids = {element["id"] for element in report["surface_elements"]}

    unknown = element_ids - known
    if unknown:
        fail(f"fixture references element ids absent from weights.yaml: {sorted(unknown)}")

    for workload in report["workloads"]:
        missing = set(workload["touches"]) - element_ids
        if missing:
            fail(f"{workload['id']} touches undefined elements: {sorted(missing)}")

    missing = set(report["orphaned"]["elements"]) - element_ids
    if missing:
        fail(f"orphaned references undefined elements: {sorted(missing)}")

    workload_ids = {workload["id"] for workload in report["workloads"]}
    for row in report["ledger"]:
        if row["workload_id"] not in workload_ids:
            fail(f"ledger row references unknown workload: {row['workload_id']}")
        for field in ("sole_owner_elements", "shared_elements"):
            missing = set(row[field]) - element_ids
            if missing:
                fail(f"{row['workload_id']}.{field}: {sorted(missing)}")

    debts = [row["surface_debt"] for row in report["ledger"]]
    if debts != sorted(debts, reverse=True):
        fail("ledger is not sorted by surface_debt descending")

    print(
        f"ok: {len(element_ids)} elements and {len(report['workloads'])} workloads "
        "cross-reference cleanly"
    )


def cve_ids_for(clusters: set[str], cve_map: dict) -> set[str]:
    """Expand cluster ids into the concrete CVE ids they carry."""
    ids: set[str] = set()
    for cluster in clusters:
        mapping = cve_map.get(cluster, {})
        ids.update(mapping.get("cves", []))
    return ids


def check_cve_counts(report: dict, cve_map: dict) -> None:
    """Every CVE count in the fixture must recompute from the curated map."""
    clusters_of = {
        element["id"]: set(element["cve_clusters"]) for element in report["surface_elements"]
    }
    reachable_ids = cve_ids_for(
        {c for e in report["surface_elements"] if e["reachable_unpriv"] for c in e["cve_clusters"]},
        cve_map,
    )
    declared = report["score"]["reachable_cve_count"]
    if declared != len(reachable_ids):
        fail(f"score.reachable_cve_count {declared} != recomputed {len(reachable_ids)}")

    for row in report["ledger"]:
        held: set[str] = set()
        for eid in row["sole_owner_elements"] + row["shared_elements"]:
            held |= clusters_of.get(eid, set())
        expected = len(cve_ids_for(held, cve_map))
        if row["reachable_cves"] != expected:
            fail(f"{row['workload_id']}.reachable_cves {row['reachable_cves']} != {expected}")

    orphaned_clusters: set[str] = set()
    for eid in report["orphaned"]["elements"]:
        orphaned_clusters |= clusters_of.get(eid, set())
    kept_clusters: set[str] = set()
    for element in report["surface_elements"]:
        if element["reachable_unpriv"] and element["id"] not in report["orphaned"]["elements"]:
            kept_clusters |= set(element["cve_clusters"])
    neutralizable = cve_ids_for(orphaned_clusters - kept_clusters, cve_map)
    declared_n = report["orphaned"]["cves_neutralizable"]
    if declared_n != len(neutralizable):
        fail(f"orphaned.cves_neutralizable {declared_n} != recomputed {len(neutralizable)}")

    projected = report["score"].get("projected_after_plan")
    if projected is not None:
        killed_hostwide = sum(
            step["cves_killed"]
            for step in report["plan"]
            if step["action"] not in PER_SERVICE_ACTIONS
        )
        expected_count = max(declared - killed_hostwide, 0)
        if projected["reachable_cve_count"] != expected_count:
            fail(f"projected.reachable_cve_count {projected['reachable_cve_count']} != {expected_count}")
        removed_weight = sum(step["weight_removed"] for step in report["plan"])
        expected_weight = round(max(report["score"]["reachable_surface_weight"] - removed_weight, 0.0), 2)
        if abs(projected["reachable_surface_weight"] - expected_weight) >= 0.01:
            fail(
                f"projected.reachable_surface_weight {projected['reachable_surface_weight']} "
                f"!= {expected_weight}"
            )

    print("ok: every CVE count recomputes from data/cve-map.json")


def check_arithmetic(report: dict) -> None:
    """Recompute every derived number so the fixture cannot drift from the formulas.

    This is the check that matters most: the demo fixture is what judges and users
    see first, and a fixture whose ledger does not obey its own documented formula
    would quietly invalidate the whole premise.
    """
    weight_of = {element["id"]: element["weight"] for element in report["surface_elements"]}

    touchers: dict[str, list[str]] = {eid: [] for eid in weight_of}
    for workload in report["workloads"]:
        for eid in workload["touches"]:
            touchers[eid].append(workload["id"])

    for row in report["ledger"]:
        debt = sum(weight_of[e] for e in row["sole_owner_elements"])
        debt += sum(weight_of[e] / len(touchers[e]) for e in row["shared_elements"])
        if abs(debt - row["surface_debt"]) >= 0.01:
            fail(
                f"{row['workload_id']}: surface_debt {row['surface_debt']} "
                f"but formula gives {debt:.2f}"
            )

        for eid in row["sole_owner_elements"]:
            if len(touchers[eid]) != 1:
                fail(
                    f"{row['workload_id']}: {eid} is listed as sole-owned "
                    f"but has {len(touchers[eid])} touchers"
                )

    print("ok: every surface_debt matches the documented formula")

    orphan_weight = sum(weight_of[e] for e in report["orphaned"]["elements"])
    if abs(orphan_weight - report["orphaned"]["total_weight"]) >= 0.01:
        fail(f"orphaned.total_weight {report['orphaned']['total_weight']} != {orphan_weight}")

    score = report["score"]
    total = sum(weight_of.values())
    if abs(total - score["total_surface_weight"]) >= 0.01:
        fail(f"total_surface_weight {score['total_surface_weight']} != {total}")

    reachable = sum(e["weight"] for e in report["surface_elements"] if e["reachable_unpriv"])
    if abs(reachable - score["reachable_surface_weight"]) >= 0.01:
        fail(f"reachable_surface_weight {score['reachable_surface_weight']} != {reachable}")

    ratio = orphan_weight / reachable
    if abs(ratio - score["orphan_ratio"]) >= 0.01:
        fail(f"orphan_ratio {score['orphan_ratio']} != {ratio:.3f}")

    print("ok: score totals recompute correctly")


def check_orphan_definition(report: dict) -> None:
    """The orphaned set must be exactly what its definition produces.

    sysctl, kconfig, and lsm kinds are excluded: a misconfigured flag is a missing
    hardening setting, not removable orphaned surface, and 'used' is not a
    meaningful predicate for it.
    """
    derived = sorted(
        element["id"]
        for element in report["surface_elements"]
        if element["kind"] in REMOVABLE_KINDS
        and element["present"]
        and element["reachable_unpriv"]
        and not element["used"]
    )
    declared = sorted(report["orphaned"]["elements"])
    if derived != declared:
        print(f"  declared: {declared}")
        print(f"  derived:  {derived}")
        fail("orphaned set does not match its definition")

    print("ok: orphaned set matches its definition exactly")


def check_plan(report: dict) -> None:
    """Plan steps must be ordered, reversible, and honest about breakage."""
    steps = [step["step"] for step in report["plan"]]
    if steps != list(range(1, len(steps) + 1)):
        fail(f"plan steps are not numbered 1..n: {steps}")

    orphaned = set(report["orphaned"]["elements"])
    element_by_name = {element["name"]: element for element in report["surface_elements"]}

    for step in report["plan"]:
        if step["action"] == "kconfig_disable" and step["breakage_risk"] == "none":
            fail(f"step {step['step']}: kconfig_disable needs a rebuild, cannot be 'none'")
        if not step["revert"].strip():
            fail(f"step {step['step']}: every step must ship a revert command")
        if step["breakage_risk"] == "none":
            for target in step["targets"]:
                element = element_by_name.get(target)
                if element and element["id"] not in orphaned and element["used"]:
                    fail(f"step {step['step']}: claims no breakage but {target} is in use")

    print(f"ok: {len(report['plan'])} plan steps ordered, reversible, and consistent")


def main() -> None:
    """Run every contract check."""
    report = check_schema_and_fixture()
    known = check_weights()
    check_references(report, known)
    cve_map = json.loads((ROOT / "data" / "cve-map.json").read_text())
    check_cve_counts(report, cve_map)
    check_arithmetic(report)
    check_orphan_definition(report)
    check_plan(report)
    print("\ncontract ok")


if __name__ == "__main__":
    main()
