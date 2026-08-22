"""Attribution: who is responsible for which surface.

Builds the per-workload ledger (sole-owner vs shared surface, surface
debt, marginal contribution) and computes the orphaned set: present,
unprivileged-reachable, removable surface that no live workload used
during the observation window.
"""

from __future__ import annotations

from engine.reachability import REMOVABLE_KINDS

TRACE_UNAVAILABLE = "none"


def cve_ids(clusters: list[str], cve_map: dict) -> set[str]:
    """Expand cluster ids into the concrete CVE ids they carry."""
    ids: set[str] = set()
    for cluster in clusters:
        mapping = cve_map.get(cluster)
        if mapping:
            ids.update(mapping.get("cves", []))
    return ids


def compute_ledger(elements: list[dict], workloads: list[dict], cve_map: dict) -> list[dict]:
    """One row per workload, sorted by surface_debt descending, ties by id.

    surface_debt(w)          = sum(weight of sole-owner elements)
                             + sum(weight / n_touchers for shared elements)
    marginal_contribution(w) = sum(weight of sole-owner elements): the
                             attributed weight that disappears if w exits
    """
    weight_of = {element["id"]: element["weight"] for element in elements}
    clusters_of = {element["id"]: element["cve_clusters"] for element in elements}

    touchers: dict[str, list[str]] = {element["id"]: [] for element in elements}
    for workload in sorted(workloads, key=lambda w: w["id"]):
        for eid in workload["touches"]:
            if eid in touchers:
                touchers[eid].append(workload["id"])

    rows: list[dict] = []
    for workload in sorted(workloads, key=lambda w: w["id"]):
        wid = workload["id"]
        touched = [eid for eid in workload["touches"] if eid in weight_of]
        sole_owner_elements = [eid for eid in touched if len(touchers[eid]) == 1]
        shared_elements = [eid for eid in touched if len(touchers[eid]) > 1]

        debt = sum(weight_of[e] for e in sole_owner_elements)
        debt += sum(weight_of[e] / len(touchers[e]) for e in shared_elements)

        held_clusters: set[str] = set()
        for eid in sole_owner_elements + shared_elements:
            held_clusters.update(clusters_of[eid])
        reachable_cves = len(cve_ids(sorted(held_clusters), cve_map))

        rows.append(
            {
                "workload_id": wid,
                "surface_debt": round(debt, 2),
                "marginal_contribution": round(sum(weight_of[e] for e in sole_owner_elements), 2),
                "sole_owner_elements": sorted(sole_owner_elements),
                "shared_elements": sorted(shared_elements),
                "reachable_cves": reachable_cves,
                "explanation": "",
            }
        )
    return sorted(rows, key=lambda r: (-r["surface_debt"], r["workload_id"]))


def compute_orphaned(elements: list[dict], trace_backend: str, cve_map: dict) -> dict:
    """Removable surface that is present, unprivileged-reachable, and unused.

    When no tracer ran (`trace_backend == "none"`), syscall usage is
    unknown rather than absent: syscall-kind elements are excluded from
    the orphaned set so absence of evidence can never masquerade as free
    hardening.
    """
    orphaned_ids = sorted(
        element["id"]
        for element in elements
        if element["kind"] in REMOVABLE_KINDS
        and element["present"]
        and element["reachable_unpriv"]
        and not element["used"]
        and not (trace_backend == TRACE_UNAVAILABLE and element["kind"] == "syscall")
    )

    by_id = {element["id"]: element for element in elements}
    orphaned_clusters = {
        cluster
        for eid in orphaned_ids
        for cluster in by_id[eid]["cve_clusters"]
    }
    kept_clusters = {
        cluster
        for element in elements
        if element["reachable_unpriv"] and element["id"] not in orphaned_ids
        for cluster in element["cve_clusters"]
    }
    unique_clusters = orphaned_clusters - kept_clusters
    neutralizable = cve_ids(sorted(unique_clusters), cve_map)

    total_weight = sum(by_id[eid]["weight"] for eid in orphaned_ids)
    return {
        "elements": orphaned_ids,
        "total_weight": round(total_weight, 2),
        "cves_neutralizable": len(neutralizable),
    }
