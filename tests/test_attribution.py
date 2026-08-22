"""Attribution tests: surface_debt, marginal contribution, ledger, orphaned."""

from __future__ import annotations

import unittest

from tests.synthetic import RAW_MINIMAL, load_cve_map, load_weights, raw_with_trace_none

from engine import attribution, reachability


def build(raw: dict) -> tuple[list[dict], list[dict]]:
    """Run reachability and return (elements, annotated workloads)."""
    elements = reachability.compute_elements(raw, load_weights())
    workloads = reachability.annotate_workloads(raw, elements)
    return elements, workloads


class LedgerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.elements, cls.workloads = build(RAW_MINIMAL)

    def test_surface_debt_matches_documented_formula(self) -> None:
        weight_of = {e["id"]: e["weight"] for e in self.elements}
        touchers: dict[str, set[str]] = {}
        for w in self.workloads:
            for eid in w["touches"]:
                touchers.setdefault(eid, set()).add(w["id"])
        for row in attribution.compute_ledger(self.elements, self.workloads, load_cve_map()):
            expected = sum(weight_of[e] for e in row["sole_owner_elements"])
            expected += sum(
                weight_of[e] / len(touchers[e]) for e in row["shared_elements"]
            )
            self.assertAlmostEqual(expected, row["surface_debt"], places=2)

    def test_ledger_sorted_by_debt_desc_then_id(self) -> None:
        rows = attribution.compute_ledger(self.elements, self.workloads, load_cve_map())
        keys = [(-r["surface_debt"], r["workload_id"]) for r in rows]
        self.assertEqual(keys, sorted(keys))

    def test_marginal_contribution_is_sole_owner_weight(self) -> None:
        rows = {
            r["workload_id"]: r
            for r in attribution.compute_ledger(self.elements, self.workloads, load_cve_map())
        }
        weight_of = {e["id"]: e["weight"] for e in self.elements}
        nginx = rows.get("w.nginx")
        if nginx is not None:
            expected = sum(weight_of[e] for e in nginx["sole_owner_elements"])
            self.assertAlmostEqual(expected, nginx["marginal_contribution"], places=2)


class OrphanedTest(unittest.TestCase):
    def test_orphaned_is_present_reachable_unused_removable(self) -> None:
        elements, _ = build(RAW_MINIMAL)
        result = attribution.compute_orphaned(elements, "strace", load_cve_map())
        removable = {"syscall", "module", "devnode", "namespace", "capability"}
        by_id = {e["id"]: e for e in elements}
        expected = sorted(
            eid
            for eid, e in by_id.items()
            if e["kind"] in removable
            and e["present"]
            and e["reachable_unpriv"]
            and not e["used"]
        )
        self.assertEqual(expected, result["elements"])

    def test_sysctl_kconfig_lsm_never_orphaned(self) -> None:
        elements, _ = build(RAW_MINIMAL)
        result = attribution.compute_orphaned(elements, "strace", load_cve_map())
        by_id = {e["id"]: e for e in elements}
        for eid in result["elements"]:
            self.assertNotIn(by_id[eid]["kind"], {"sysctl", "kconfig", "lsm"})

    def test_no_trace_guard_excludes_syscalls_from_orphaned(self) -> None:
        raw = raw_with_trace_none()
        elements, _ = build(raw)
        result = attribution.compute_orphaned(elements, "none", load_cve_map())
        by_id = {e["id"]: e for e in elements}
        for eid in result["elements"]:
            self.assertNotEqual(by_id[eid]["kind"], "syscall")

    def test_total_weight_equals_sum_of_members(self) -> None:
        elements, _ = build(RAW_MINIMAL)
        result = attribution.compute_orphaned(elements, "strace", load_cve_map())
        weight_of = {e["id"]: e["weight"] for e in elements}
        self.assertAlmostEqual(
            sum(weight_of[e] for e in result["elements"]), result["total_weight"], places=2
        )

    def test_neutralizable_counts_only_unique_to_orphans(self) -> None:
        elements, _ = build(RAW_MINIMAL)
        cve_map = load_cve_map()
        result = attribution.compute_orphaned(elements, "strace", cve_map)
        orphan_ids = set(result["elements"])
        orphan_clusters = {
            c for e in elements if e["id"] in orphan_ids for c in e["cve_clusters"]
        }
        kept_clusters = {
            c
            for e in elements
            if e["id"] not in orphan_ids and e["reachable_unpriv"]
            for c in e["cve_clusters"]
        }
        unique = {
            cve
            for cluster in orphan_clusters - kept_clusters
            for cve in cve_map[cluster]["cves"]
        }
        self.assertEqual(len(unique), result["cves_neutralizable"])


if __name__ == "__main__":
    unittest.main()
