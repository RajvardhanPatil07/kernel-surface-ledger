"""Set-cover planner tests: greedy order, costs, projections."""

from __future__ import annotations

import unittest

from tests.synthetic import RAW_MINIMAL, load_cve_map, load_weights

from engine import attribution, reachability, setcover


class PlanTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.elements = reachability.compute_elements(RAW_MINIMAL, load_weights())
        workloads = reachability.annotate_workloads(RAW_MINIMAL, cls.elements)
        cls.orphaned = attribution.compute_orphaned(
            cls.elements, RAW_MINIMAL["meta"]["trace_backend"], load_cve_map()
        )
        cls.plan = setcover.build_plan(cls.elements, workloads, cls.orphaned, load_cve_map())

    def test_steps_numbered_from_one(self) -> None:
        self.assertEqual([s["step"] for s in self.plan], list(range(1, len(self.plan) + 1)))

    def test_at_most_five_steps(self) -> None:
        self.assertLessEqual(len(self.plan), 5)

    def test_actions_are_schema_enumerants(self) -> None:
        allowed = {
            "blacklist_module",
            "seccomp_filter",
            "sysctl_set",
            "kconfig_disable",
            "systemd_confine",
            "remove_devnode_access",
        }
        for step in self.plan:
            self.assertIn(step["action"], allowed)

    def test_every_step_ships_revert_and_detection(self) -> None:
        for step in self.plan:
            self.assertTrue(step["revert"].strip())
            self.assertTrue(step["detection"].strip())
            self.assertTrue(step["artifact"]["path"].strip())

    def test_breakage_none_only_for_fully_orphaned_targets(self) -> None:
        orphaned = set(self.orphaned["elements"])
        by_name = {e["name"]: e for e in self.elements}
        for step in self.plan:
            if step["breakage_risk"] == "none":
                for target in step["targets"]:
                    element = by_name.get(target)
                    if element is not None and element["used"]:
                        self.fail(f"step {step['step']} claims none but {target} is used")

    def test_kconfig_disable_never_claims_zero_breakage(self) -> None:
        for step in self.plan:
            if step["action"] == "kconfig_disable":
                self.assertNotEqual(step["breakage_risk"], "none")
                self.assertTrue(step["requires_reboot"])

    def test_cves_killed_never_inflates(self) -> None:
        total = sum(s["cves_killed"] for s in self.plan)
        reachable_cves = len(
            {c for e in self.elements if e["reachable_unpriv"] for c in e["cve_clusters"]}
        )
        self.assertLessEqual(total, reachable_cves)

    def test_projected_weight_reduces_reachable_surface(self) -> None:
        projection = setcover.project_after_plan(
            self.elements, self.plan, load_cve_map()
        )
        current = sum(e["weight"] for e in self.elements if e["reachable_unpriv"])
        if any(s["weight_removed"] > 0 for s in self.plan):
            self.assertLess(projection["reachable_surface_weight"], current)

    def test_projection_is_in_cve_id_space(self) -> None:
        projection = setcover.project_after_plan(
            self.elements, self.plan, load_cve_map()
        )
        from engine.report_cves import count_reachable_cves

        current = count_reachable_cves(self.elements, load_cve_map())
        hostwide_killed = sum(
            s["cves_killed"]
            for s in self.plan
            if s["action"] in setcover.HOST_WIDE_ACTIONS
        )
        self.assertEqual(current - hostwide_killed, projection["reachable_cve_count"])

    def test_per_service_steps_do_not_reduce_host_surface(self) -> None:
        for step in self.plan:
            if step["action"] in {"seccomp_filter", "systemd_confine"}:
                self.assertEqual(0.0, step["weight_removed"])


if __name__ == "__main__":
    unittest.main()
