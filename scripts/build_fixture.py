#!/usr/bin/env python3
"""Regenerate fixtures/demo.json through the real deterministic pipeline.

The demo fixture is not hand-written: it is the engine's output over a
committed synthetic snapshot (fixtures/raw-demo.json) that mirrors a
typical Ubuntu server. Curated prose explanations are merged back from
the previous fixture so the demo keeps its narration; every numeric
field is engine truth.

Run:  venv/bin/python scripts/build_fixture.py
"""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import yaml

from engine import report as report_engine

RAW_DEMO: dict = {
    "meta": {
        "kernel_release": "6.8.0-45-generic",
        "arch": "x86_64",
        "distro": "Ubuntu 24.04.1 LTS",
        "collected_at": "2026-08-22T15:04:11Z",
        "trace_seconds": 60,
        "trace_backend": "strace",
        "ran_as_root": True,
        "ksl_version": "0.1.0",
        "skipped": [],
    },
    "kconfig": {
        "CONFIG_USER_NS": "y",
        "CONFIG_IO_URING": "y",
        "CONFIG_BPF_SYSCALL": "y",
        "CONFIG_USERFAULTFD": "y",
        "CONFIG_PERF_EVENTS": "y",
        "CONFIG_KEYS": "y",
        "CONFIG_STRICT_DEVMEM": "y",
        "CONFIG_COMPAT": "y",
    },
    "modules_loaded": [
        {"name": "bluetooth", "instances": 0},
        {"name": "usb_storage", "instances": 1},
    ],
    "modules_available": [
        "bluetooth", "cramfs", "dccp", "firewire_core", "freevxfs", "hfsplus",
        "jffs2", "n_hdlc", "rds", "tipc", "udf", "usb_storage",
    ],
    "sysctls": {
        "kernel.unprivileged_userns_clone": "1",
        "kernel.unprivileged_bpf_disabled": "1",
        "vm.unprivileged_userfaultfd": "1",
        "kernel.perf_event_paranoid": "2",
        "kernel.kptr_restrict": "1",
        "kernel.dmesg_restrict": "0",
        "kernel.modules_disabled": "0",
        "kernel.io_uring_disabled": "0",
    },
    "lsm_list": ["lockdown", "yama"],
    "lockdown_state": "[none] integrity confidentiality",
    "cmdline": "BOOT_IMAGE=/vmlinuz root=/dev/sda1 quiet splash",
    "cpu_vulnerabilities": {},
    "devnodes": {
        "/dev/mem": {"path": "/dev/mem", "mode_octal": "0640", "uid": 0, "gid": 15,
                     "nonroot_read": False, "nonroot_write": False},
        "/dev/kvm": {"path": "/dev/kvm", "mode_octal": "0666", "uid": 0, "gid": 108,
                     "nonroot_read": True, "nonroot_write": True},
    },
    "workloads": [
        {"id": "w.dockerd", "comm": "dockerd", "unit": "docker.service", "pids": [1284],
         "uid": 0, "caps_effective": ["CAP_21"], "seccomp_mode": 0, "no_new_privs": False,
         "open_paths": []},
        {"id": "w.libvirtd", "comm": "libvirtd", "unit": "libvirtd.service", "pids": [1622],
         "uid": 0, "caps_effective": ["CAP_21"], "seccomp_mode": 0, "no_new_privs": False,
         "open_paths": ["/dev/kvm"]},
        {"id": "w.nginx", "comm": "nginx", "unit": "nginx.service", "pids": [2011],
         "uid": 33, "caps_effective": [], "seccomp_mode": 0, "no_new_privs": False,
         "open_paths": []},
        {"id": "w.sshd", "comm": "sshd", "unit": "ssh.service", "pids": [980],
         "uid": 0, "caps_effective": ["CAP_19"], "seccomp_mode": 2, "no_new_privs": False,
         "open_paths": []},
        {"id": "w.udisksd", "comm": "udisksd", "unit": "udisks2.service", "pids": [1105],
         "uid": 0, "caps_effective": ["CAP_21"], "seccomp_mode": 0, "no_new_privs": False,
         "open_paths": ["/dev/sda1"]},
    ],
    "traced_syscalls": {
        "1284": ["clone", "io_uring_setup", "keyctl", "setns"],
        "2011": ["accept4", "epoll_wait", "io_uring_setup"],
        "980": ["accept4", "keyctl"],
        "1622": ["ioctl"],
        "1105": ["ioctl"],
    },
}

EXPLANATIONS = {
    "w.dockerd": (
        "dockerd is the only workload on this host traced using unprivileged user "
        "namespaces; it uses them to map container UIDs and to construct network "
        "namespaces for bridge networking. It shares io_uring with nginx and keyctl "
        "with sshd, so those cannot be attributed to it alone.\n\n"
        "User namespaces are a surface amplifier rather than a single defect: they "
        "grant an unprivileged process access to subsystems written on the assumption "
        "of CAP_SYS_ADMIN, which is why they appear as the first link in most recent "
        "local privilege escalation chains.\n\n"
        "Rootless Podman with a restricted seccomp profile provides the same container "
        "workflow without holding host-wide unprivileged user namespaces open."
    ),
    "w.libvirtd": (
        "libvirtd is the sole consumer of /dev/kvm on this host, which it needs to "
        "create hardware-accelerated guests. The device node is currently mode 0666, "
        "so every local user can reach its very large ioctl surface, not just the "
        "virtualisation daemon.\n\n"
        "This one is cheap to fix without touching functionality: restrict /dev/kvm to "
        "the kvm group and add libvirtd's user to it. The daemon keeps working and the "
        "surface stops being unprivileged-reachable."
    ),
    "w.nginx": (
        "nginx uses io_uring for asynchronous file serving. It shares this element with "
        "dockerd, so its marginal contribution is zero: removing nginx would not close "
        "io_uring, because dockerd would keep it open.\n\n"
        "A per-service seccomp filter denying the io_uring family confines nginx "
        "specifically, which is worth doing even though it does not reduce the "
        "host-wide score - it removes nginx as a pivot without affecting dockerd."
    ),
    "w.udisksd": (
        "udisksd holds the usb-storage module open to provide automatic removable media "
        "handling on a machine that, per its systemd target, is running headless.\n\n"
        "If this host does not need removable media, masking udisks2.service and "
        "blacklisting usb-storage removes the surface entirely. If it does, USBGuard is "
        "the appropriate control instead."
    ),
    "w.sshd": (
        "sshd touches keyctl for session keyring setup and shares it with dockerd, so "
        "it owns none of this surface exclusively and its marginal contribution is zero."
        "\n\nsshd already runs with seccomp_mode 2, which is the correct posture; no "
        "change is recommended for this workload."
    ),
}


def main() -> int:
    """Build raw snapshot, run the engine, merge prose, validate, write."""
    weights = yaml.safe_load((ROOT / "data" / "weights.yaml").read_text())
    cve_map = json.loads((ROOT / "data" / "cve-map.json").read_text())

    (ROOT / "fixtures" / "raw-demo.json").write_text(
        json.dumps(RAW_DEMO, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    built = report_engine.build_report(deepcopy(RAW_DEMO), weights, cve_map)
    for row in built["ledger"]:
        row["explanation"] = EXPLANATIONS.get(row["workload_id"], "")

    report_engine.validate_report(built)
    (ROOT / "fixtures" / "demo.json").write_text(
        json.dumps(built, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )

    print(f"elements={len(built['surface_elements'])} workloads={len(built['workloads'])}")
    print(f"orphaned={len(built['orphaned']['elements'])} plan_steps={len(built['plan'])}")
    print(f"score={json.dumps(built['score'], indent=1)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
