"""Three-tier reachability gate.

For every element in the curated weights table, decides:

- present          compiled in (=y), loaded, or loadable via module autoload
- reachable_unpriv present AND not blocked by its sysctl gate AND not blocked
                   by lockdown/LSM AND (devnodes) mode grants non-root access
- used             invoked or held open by at least one live workload during
                   the observation window

Also derives each workload's `touches`: the surface-element ids it holds
open, inferred from open device paths, traced syscalls, and capability
evidence. All rules are pure functions of the raw snapshot.
"""

from __future__ import annotations

import re
from typing import Callable

KCONFIG_PRESENCE: dict[str, tuple[str, ...]] = {
    "ns.userns_unpriv": ("CONFIG_USER_NS",),
    "sc.io_uring_setup": ("CONFIG_IO_URING",),
    "sc.bpf_unpriv": ("CONFIG_BPF_SYSCALL",),
    "sc.userfaultfd": ("CONFIG_USERFAULTFD",),
    "sc.perf_event_open": ("CONFIG_PERF_EVENTS",),
    "sc.keyctl": ("CONFIG_KEYS",),
    "cfg.kconfig_compat": ("CONFIG_COMPAT",),
}

KCONFIG_MODULE_FALLBACK: dict[str, tuple[str, ...]] = {
    "sc.io_uring_setup": ("io_uring",),
    "sc.bpf_unpriv": ("bpf_syscall", "bpf"),
    "sc.userfaultfd": ("userfaultfd",),
    "sc.perf_event_open": ("perf_events", "perf"),
}

MODULE_MEMBERS: dict[str, tuple[str, ...]] = {
    "mod.legacy_fs": ("cramfs", "freevxfs", "jffs2", "hfsplus", "udf"),
}

DEV_PATHS: dict[str, str] = {
    "dev.mem": "/dev/mem",
    "dev.kvm": "/dev/kvm",
}

SYSCALL_TRIGGERS: dict[str, set[str]] = {
    "sc.io_uring_setup": {"io_uring_setup", "io_uring_enter", "io_uring_register"},
    "sc.bpf_unpriv": {"bpf"},
    "sc.userfaultfd": {"userfaultfd"},
    "sc.perf_event_open": {"perf_event_open"},
    "sc.keyctl": {"keyctl", "add_key", "request_key"},
}

NAMESPACE_TRIGGERS: set[str] = {"unshare", "setns"}

MODULE_DEV_HINTS: dict[str, tuple[str, ...]] = {
    "mod.usb_storage": ("/dev/sd", "/dev/sr"),
    "mod.bluetooth": ("/dev/rfkill",),
}

CAP_SYS_ADMIN_BIT = 21

REMOVABLE_KINDS = frozenset({"syscall", "module", "devnode", "namespace", "capability"})


def _sysctl_int(sysctls: dict[str, str], name: str) -> int | None:
    """Parse a sysctl value as int; None when unreadable."""
    value = sysctls.get(name)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _gate_blocks(element_id: str, gate: str | None, sysctls: dict[str, str]) -> tuple[bool, str]:
    """Return (blocked, reason) for an element's named sysctl gate."""
    if not gate:
        return False, ""
    value = _sysctl_int(sysctls, gate)
    if value is None:
        return False, ""
    blocked = _GATE_PREDICATES.get(gate, lambda v: False)(value)
    reason = f"blocked: {gate}={value}" if blocked else f"{gate}={value}"
    return blocked, reason


_GATE_PREDICATES: dict[str, Callable[[int], bool]] = {
    "kernel.unprivileged_userns_clone": lambda v: v == 0,
    "user.max_user_namespaces": lambda v: v == 0,
    "kernel.unprivileged_bpf_disabled": lambda v: v >= 1,
    "vm.unprivileged_userfaultfd": lambda v: v == 0,
    "kernel.perf_event_paranoid": lambda v: v >= 3,
    "kernel.modules_disabled": lambda v: v == 1,
}


def _io_uring_gate(sysctls: dict[str, str]) -> tuple[bool, str]:
    """kernel.io_uring_disabled: 0 off, 1 unprivileged weak-blocked, 2 fully."""
    value = _sysctl_int(sysctls, "kernel.io_uring_disabled")
    if value is None:
        return False, "kernel.io_uring_disabled unset"
    blocked = value >= 2
    reason = f"blocked: kernel.io_uring_disabled={value}" if blocked else f"kernel.io_uring_disabled={value}"
    return blocked, reason


def _kconfig_present(kconfig: dict[str, str], symbols: tuple[str, ...]) -> bool:
    """A symbol counts when built in (=y); autoloadable =m handled by modules."""
    return any(kconfig.get(symbol) == "y" for symbol in symbols)


def _syscall_present(entry: dict, raw: dict) -> bool:
    """Built in (=y), or shipped as a loadable module for this element."""
    if _kconfig_present(raw["kconfig"], KCONFIG_PRESENCE.get(entry["id"], ())):
        return True
    fallback = KCONFIG_MODULE_FALLBACK.get(entry["id"], ())
    loaded_names = {m["name"] for m in raw["modules_loaded"]}
    return any(name in raw["modules_available"] or name in loaded_names for name in fallback)


def _module_state(entry: dict, raw: dict) -> tuple[bool, bool, str]:
    """Return (present, reachable, reason) for a module-kind element."""
    members = MODULE_MEMBERS.get(entry["id"], (entry["name"],))
    loaded_names = {m["name"] for m in raw["modules_loaded"]}
    available = set(raw["modules_available"])
    loaded_here = [m for m in members if m in loaded_names]
    loadable_here = [m for m in members if m in available]
    if loaded_here or loadable_here:
        parts: list[str] = []
        if loaded_here:
            parts.append(f"loaded: {', '.join(sorted(loaded_here))}")
        elif loadable_here:
            parts.append(
                f"not loaded but autoloadable via modules.dep ({', '.join(sorted(loadable_here))})"
            )
        reachable = bool(loaded_here) or _sysctl_int(raw["sysctls"], "kernel.modules_disabled") != 1
        if not reachable:
            parts.append("blocked: kernel.modules_disabled=1")
        return True, reachable, "; ".join(parts)
    return False, False, "not present on host"


def _devnode_state(entry: dict, raw: dict) -> tuple[bool, bool, str]:
    """Return (present, reachable, reason) for a devnode-kind element."""
    path = DEV_PATHS[entry["id"]]
    evidence = raw["devnodes"].get(path)
    if evidence is None:
        return False, False, "node absent"
    mode = evidence["mode_octal"]
    if not (evidence["nonroot_read"] or evidence["nonroot_write"]):
        return True, False, f"blocked: mode {mode} denies non-root"
    kconfig = raw["kconfig"]
    lockdown_active = _lockdown_level(raw) in {"integrity", "confidentiality"}
    if entry["id"] == "dev.mem" and (
        kconfig.get("CONFIG_STRICT_DEVMEM") == "y" or kconfig.get("CONFIG_IO_STRICT_DEVMEM") == "y"
    ):
        return True, False, f"blocked: STRICT_DEVMEM=y despite mode {mode}"
    if entry["id"] == "dev.mem" and lockdown_active:
        return True, False, f"blocked: lockdown {lockdown_active} despite mode {mode}"
    return True, True, f"mode {mode} grants non-root"


def _lockdown_level(raw: dict) -> str | None:
    """Extract the active level from the lockdown sysfs line."""
    state = raw.get("lockdown_state")
    if not state:
        return None
    match = re.search(r"\[(\w+)\]", state)
    return match.group(1) if match else "none"


def _syscall_state(entry: dict, raw: dict) -> tuple[bool, bool, str]:
    """Return (present, reachable, reason) for syscall/namespace elements."""
    present = _syscall_present(entry, raw)
    if entry["id"] == "sc.io_uring_setup":
        blocked, reason = _io_uring_gate(raw["sysctls"])
    else:
        blocked, reason = _gate_blocks(entry["id"], entry.get("gate"), raw["sysctls"])
    return present, present and not blocked, reason


def _ambient_state(entry: dict, raw: dict) -> tuple[bool, bool, str]:
    """Present/reachable for policy elements (sysctl and lsm kinds)."""
    sysctls = raw["sysctls"]
    eid = entry["id"]
    if eid == "cfg.module_autoload":
        disabled = _sysctl_int(sysctls, "kernel.modules_disabled")
        if disabled is None:
            return False, False, "kernel.modules_disabled unreadable"
        return True, disabled != 1, f"kernel.modules_disabled={disabled}"
    if eid == "cfg.no_kptr_restrict":
        value = _sysctl_int(sysctls, "kernel.kptr_restrict")
        if value is None:
            return False, False, "kernel.kptr_restrict unreadable"
        return True, value < 2, f"kernel.kptr_restrict={value}"
    if eid == "cfg.dmesg_open":
        value = _sysctl_int(sysctls, "kernel.dmesg_restrict")
        if value is None:
            return False, False, "kernel.dmesg_restrict unreadable"
        return True, value == 0, f"kernel.dmesg_restrict={value}"
    if eid == "cfg.no_lockdown":
        level = _lockdown_level(raw)
        if level is None:
            return False, False, "lockdown state unreadable"
        if level != "none":
            return False, False, f"active: lockdown {level}"
        return True, False, "root-only impact"
    return False, False, "unknown ambient element"


def _capability_state(entry: dict, raw: dict) -> tuple[bool, bool, str]:
    """CAP_SYS_ADMIN held by any non-root workload."""
    holders = [
        w["id"]
        for w in raw["workloads"]
        if w["uid"] != 0 and f"CAP_{CAP_SYS_ADMIN_BIT}" in w["caps_effective"]
    ]
    if holders:
        return True, True, f"held by: {', '.join(sorted(holders))}"
    return False, False, "no non-root workload holds CAP_SYS_ADMIN"


def _kconfig_state(entry: dict, raw: dict) -> tuple[bool, bool, str]:
    """Present/reachable for kconfig-kind elements: built in or not."""
    symbols = KCONFIG_PRESENCE.get(entry["id"], (entry["name"],))
    present = _kconfig_present(raw["kconfig"], symbols)
    return present, present, "compiled in" if present else "not built"


_KIND_STATE = {
    "namespace": _syscall_state,
    "syscall": _syscall_state,
    "module": _module_state,
    "devnode": _devnode_state,
    "sysctl": _ambient_state,
    "lsm": _ambient_state,
    "kconfig": _kconfig_state,
    "capability": _capability_state,
}


def _traced_names(raw: dict) -> set[str]:
    """All syscall names observed across the trace window."""
    names: set[str] = set()
    for per_pid in raw.get("traced_syscalls", {}).values():
        names.update(per_pid)
    return names


def compute_elements(raw: dict, weights: dict) -> list[dict]:
    """Build the surface_elements list from raw evidence and curated weights."""
    entries = [entry for group in weights.values() for entry in group]
    traced = _traced_names(raw)

    elements: list[dict] = []
    for entry in entries:
        kind = entry["kind"]
        present, reachable, reason = _KIND_STATE[kind](entry, raw)
        used = _element_used(entry, raw, traced)
        mitigations = [str(m) for m in entry.get("mitigations", [])]
        elements.append(
            {
                "id": entry["id"],
                "kind": kind,
                "name": entry["name"],
                "subsystem": entry.get("subsystem", ""),
                "weight": float(entry["weight"]),
                "present": present,
                "reachable_unpriv": bool(present and reachable),
                "used": used,
                "gate_reason": reason,
                "cve_clusters": sorted(entry.get("cve_clusters", [])),
                "mitigations": mitigations,
            }
        )
    return sorted(elements, key=lambda e: e["id"])


def _element_used(entry: dict, raw: dict, traced: set[str]) -> bool:
    """Decide the used flag for one element."""
    eid = entry["id"]
    kind = entry["kind"]
    if kind == "syscall":
        return bool(SYSCALL_TRIGGERS.get(eid, set()) & traced)
    if kind == "namespace":
        return bool(NAMESPACE_TRIGGERS & traced)
    if kind == "module":
        members = MODULE_MEMBERS.get(eid, (entry["name"],))
        if any(m["instances"] > 0 for m in raw["modules_loaded"] if m["name"] in members):
            return True
        prefixes = MODULE_DEV_HINTS.get(eid, ())
        return any(
            path.startswith(prefixes)
            for workload in raw["workloads"]
            for path in workload["open_paths"]
        )
    if kind == "devnode":
        path = DEV_PATHS[eid]
        return any(path in w["open_paths"] for w in raw["workloads"])
    if kind == "sysctl":
        return True
    if kind == "capability":
        present, _, _ = _capability_state(entry, raw)
        return present
    return False


def annotate_workloads(raw: dict, elements: list[dict]) -> list[dict]:
    """Attach deterministic `touches` lists to workload copies."""
    by_id = {e["id"]: e for e in elements}
    pid_to_workload: dict[int, dict] = {}
    for workload in raw["workloads"]:
        for pid in workload["pids"]:
            pid_to_workload[pid] = workload

    annotated: list[dict] = []
    for workload in raw["workloads"]:
        touches: set[str] = set()
        for path in workload["open_paths"]:
            for eid, dev_path in DEV_PATHS.items():
                if eid in by_id and path == dev_path:
                    touches.add(eid)
            for eid, prefixes in MODULE_DEV_HINTS.items():
                if eid in by_id and any(path.startswith(p) for p in prefixes):
                    touches.add(eid)
        for pid in workload["pids"]:
            for name in raw.get("traced_syscalls", {}).get(str(pid), []):
                for eid, triggers in SYSCALL_TRIGGERS.items():
                    if eid in by_id and name in triggers:
                        touches.add(eid)
                if name in NAMESPACE_TRIGGERS and "ns.userns_unpriv" in by_id:
                    touches.add("ns.userns_unpriv")
        schema_workload: dict = {
            "id": workload["id"],
            "comm": workload["comm"],
        }
        if workload.get("unit"):
            schema_workload["unit"] = str(workload["unit"])
        schema_workload.update(
            {
                "pids": sorted(workload["pids"]),
                "uid": workload["uid"],
                "caps_effective": sorted(workload["caps_effective"]),
                "seccomp_mode": workload["seccomp_mode"],
                "touches": sorted(touches),
            }
        )
        annotated.append(schema_workload)
    return sorted(annotated, key=lambda w: w["id"])
