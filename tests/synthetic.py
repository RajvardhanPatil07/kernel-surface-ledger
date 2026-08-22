"""Shared synthetic evidence for engine tests.

Builds a tiny, fully deterministic raw snapshot plus the real curated
tables so tests exercise the same inputs production uses.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

RAW_MINIMAL: dict = {
    "meta": {
        "kernel_release": "6.8.0-45-generic",
        "arch": "x86_64",
        "distro": "Test Linux",
        "collected_at": "2026-08-22T00:00:00Z",
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
    },
    "modules_loaded": [
        {"name": "bluetooth", "instances": 0},
        {"name": "usb_storage", "instances": 1},
    ],
    "modules_available": ["bluetooth", "usb_storage", "dccp", "rds", "tipc", "n_hdlc", "firewire_core", "cramfs"],
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
    "cmdline": "BOOT_IMAGE=/vmlinuz root=/dev/sda1",
    "cpu_vulnerabilities": {},
    "devnodes": {
        "/dev/mem": {"path": "/dev/mem", "mode_octal": "0640", "uid": 0, "gid": 15, "nonroot_read": False, "nonroot_write": False},
        "/dev/kvm": {"path": "/dev/kvm", "mode_octal": "0666", "uid": 0, "gid": 108, "nonroot_read": True, "nonroot_write": True},
    },
    "workloads": [
        {
            "id": "w.dockerd",
            "comm": "dockerd",
            "unit": "docker.service",
            "pids": [1284],
            "uid": 0,
            "caps_effective": ["CAP_21"],
            "seccomp_mode": 0,
            "no_new_privs": False,
            "open_paths": ["/dev/kvm"],
        },
        {
            "id": "w.nginx",
            "comm": "nginx",
            "unit": "nginx.service",
            "pids": [2011],
            "uid": 33,
            "caps_effective": [],
            "seccomp_mode": 0,
            "no_new_privs": False,
            "open_paths": [],
        },
    ],
    "traced_syscalls": {"2011": ["io_uring_setup", "keyctl"]},
}


def load_weights() -> dict:
    """Load the real curated weights table."""
    import yaml

    return yaml.safe_load((ROOT / "data" / "weights.yaml").read_text())


def load_cve_map() -> dict:
    """Load the real curated CVE cluster map."""
    return json.loads((ROOT / "data" / "cve-map.json").read_text())


def raw_with_trace_none() -> dict:
    """A copy of the minimal snapshot claiming no tracer was available."""
    import copy

    snapshot = copy.deepcopy(RAW_MINIMAL)
    snapshot["meta"]["trace_backend"] = "none"
    snapshot["traced_syscalls"] = {}
    return snapshot
