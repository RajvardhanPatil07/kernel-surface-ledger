"""CVE-count helpers shared by scoring and projection."""

from __future__ import annotations

from engine.attribution import cve_ids


def count_reachable_cves(elements: list[dict], cve_map: dict) -> int:
    """Distinct concrete CVE ids reachable through any unprivileged-reachable element."""
    clusters = sorted({cluster for element in elements if element["reachable_unpriv"] for cluster in element["cve_clusters"]})
    return len(cve_ids(clusters, cve_map))


def project_cve_count(elements: list[dict], covered_element_ids: set[str], cve_map: dict) -> int:
    """CVE count after hypothetically removing the given elements from reachability."""
    clusters = sorted(
        {
            cluster
            for element in elements
            if element["reachable_unpriv"] and element["id"] not in covered_element_ids
            for cluster in element["cve_clusters"]
        }
    )
    return len(cve_ids(clusters, cve_map))
