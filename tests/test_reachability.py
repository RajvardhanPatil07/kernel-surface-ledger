"""Reachability gate tests: present, reachable_unpriv, used, touches."""

from __future__ import annotations

import unittest

from tests.synthetic import RAW_MINIMAL, load_weights

from engine import reachability


class ReachabilityTest(unittest.TestCase):
    """The three-tier gate decides everything downstream; pin it hard."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.weights = load_weights()
        cls.elements = {e["id"]: e for e in reachability.compute_elements(RAW_MINIMAL, cls.weights)}
        cls.workloads = reachability.annotate_workloads(RAW_MINIMAL, list(cls.elements.values()))

    def test_every_weight_entry_becomes_an_element(self) -> None:
        expected = {
            entry["id"]
            for group in self.weights.values()
            for entry in group
        }
        self.assertEqual(expected, set(self.elements))

    def test_module_loaded_with_zero_instances_is_present_and_reachable(self) -> None:
        element = self.elements["mod.bluetooth"]
        self.assertTrue(element["present"])
        self.assertTrue(element["reachable_unpriv"])
        self.assertFalse(element["used"])

    def test_module_only_autoloadable_is_present_and_reachable(self) -> None:
        element = self.elements["mod.dccp"]
        self.assertTrue(element["present"])
        self.assertTrue(element["reachable_unpriv"])
        self.assertIn("autoload", element["gate_reason"])

    def test_module_absent_from_host_is_not_present(self) -> None:
        element = self.elements["mod.legacy_fs"]
        members = reachability.MODULE_MEMBERS["mod.legacy_fs"]
        available = RAW_MINIMAL["modules_available"]
        if any(m in available for m in members):
            self.skipTest("synthetic host lists a legacy_fs member as available")
        self.assertFalse(element["present"])

    def test_module_autoload_blocked_when_modules_disabled(self) -> None:
        raw = dict(RAW_MINIMAL)
        raw["sysctls"] = {**RAW_MINIMAL["sysctls"], "kernel.modules_disabled": "1"}
        raw["modules_loaded"] = [m for m in RAW_MINIMAL["modules_loaded"] if m["name"] != "bluetooth"]
        elements = {e["id"]: e for e in reachability.compute_elements(raw, self.weights)}
        self.assertFalse(elements["mod.dccp"]["reachable_unpriv"])

    def test_sysctl_gate_blocks_unprivileged_reach(self) -> None:
        self.assertFalse(self.elements["sc.bpf_unpriv"]["reachable_unpriv"])
        self.assertTrue(self.elements["sc.io_uring_setup"]["reachable_unpriv"])

    def test_used_comes_from_traced_syscalls(self) -> None:
        self.assertTrue(self.elements["sc.io_uring_setup"]["used"])
        self.assertTrue(self.elements["sc.keyctl"]["used"])
        self.assertFalse(self.elements["sc.userfaultfd"]["used"])

    def test_devnode_mode_grants_nonroot_access(self) -> None:
        self.assertTrue(self.elements["dev.kvm"]["reachable_unpriv"])
        self.assertFalse(self.elements["dev.mem"]["reachable_unpriv"])

    def test_workload_touches_devnode_it_holds_open(self) -> None:
        dockerd = next(w for w in self.workloads if w["id"] == "w.dockerd")
        self.assertIn("dev.kvm", dockerd["touches"])

    def test_traced_syscall_attributes_to_owning_workload(self) -> None:
        nginx = next(w for w in self.workloads if w["id"] == "w.nginx")
        self.assertIn("sc.io_uring_setup", nginx["touches"])
        self.assertIn("sc.keyctl", nginx["touches"])

    def test_ambient_sysctls_report_reachability(self) -> None:
        self.assertTrue(self.elements["cfg.no_kptr_restrict"]["reachable_unpriv"])
        self.assertTrue(self.elements["cfg.dmesg_open"]["reachable_unpriv"])
        self.assertFalse(self.elements["cfg.no_lockdown"]["reachable_unpriv"])

    def test_elements_sorted_by_id_for_determinism(self) -> None:
        ids = list(self.elements)
        self.assertEqual(sorted(ids), ids)


if __name__ == "__main__":
    unittest.main()
