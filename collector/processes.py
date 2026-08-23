"""Process enumeration and workload grouping.

Walks /proc/[0-9]* once, gathering per-process identity (comm, exe,
uid), privilege posture (capabilities, seccomp, no-new-privs) and the
kernel-facing evidence that feeds attribution: every /dev/* path held
open via fd or mapped. Processes are then grouped into workloads keyed
by their systemd unit when one can be determined, falling back to
comm+exe. Kernel threads (no exe link) are skipped.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

PROC = Path("/proc")

PID_DIR = re.compile(r"^[0-9]+$")

STATUS_FIELDS: tuple[str, ...] = ("Uid", "CapEff", "CapPrm", "Seccomp", "NoNewPrivs")


def parse_status(text: str) -> dict[str, str]:
    """Extract the interesting fields from a /proc/<pid>/status file."""
    result: dict[str, str] = {}
    for line in text.splitlines():
        key, _, value = line.partition(":")
        key = key.strip()
        if key in STATUS_FIELDS:
            result[key] = value.strip()
    return result


def parse_unit_from_cgroup(text: str) -> str | None:
    """Derive the systemd unit name from /proc/<pid>/cgroup content.

    Prefers explicit .service/.scope entries; returns the last path
    segment as a fallback handle for slices or cgroup namespaces.
    """
    unit_match = re.search(r"[0-9]+:[a-z]+:(/.*)$", text, re.MULTILINE)
    if not unit_match:
        return None
    tail = unit_match.group(1).rstrip("/").split("/")[-1]
    if not tail or tail in {"init.scope"}:
        return None
    return tail


def parse_map_paths(text: str) -> list[str]:
    """Return sorted unique /dev/* paths appearing in a maps file."""
    paths: set[str] = set()
    for line in text.splitlines():
        parts = line.split(maxsplit=5)
        if len(parts) == 6:
            candidate = parts[5].strip()
            if candidate.startswith("/dev/"):
                paths.add(candidate)
    return sorted(paths)


def read_process(pid_dir: Path, skips: list[dict[str, str]]) -> dict[str, object] | None:
    """Read one process's evidence; None for kernel threads and races."""
    comm_path = pid_dir / "comm"
    exe_path = pid_dir / "exe"
    try:
        try:
            exe = os.readlink(exe_path)
        except PermissionError as exc:
            skips.append(
                {"source": f"process:{pid_dir.name}", "reason": f"exe unreadable: {exc}"}
            )
            return None
        except OSError:
            return None
        comm = comm_path.read_text(encoding="utf-8", errors="replace").strip()
        status = parse_status((pid_dir / "status").read_text(encoding="utf-8", errors="replace"))
        try:
            cgroup_text = (pid_dir / "cgroup").read_text(encoding="utf-8", errors="replace")
            unit = parse_unit_from_cgroup(cgroup_text)
        except (OSError, PermissionError):
            unit = None

        open_paths: set[str] = set()
        fd_dir = pid_dir / "fd"
        try:
            for entry in os.listdir(fd_dir):
                try:
                    target = os.readlink(fd_dir / entry)
                except OSError:
                    continue
                if target.startswith("/dev/") or target.startswith("/proc/"):
                    open_paths.add(target)
        except PermissionError as exc:
            skips.append(
                {"source": f"process:{pid_dir.name}/fd", "reason": f"permission denied: {exc}"}
            )
        except OSError as exc:
            skips.append({"source": f"process:{pid_dir.name}/fd", "reason": str(exc)})
        try:
            open_paths.update(parse_map_paths((pid_dir / "maps").read_text(encoding="utf-8", errors="replace")))
        except (OSError, PermissionError):
            pass

        uid_field = status.get("Uid", "0 0 0 0")
        return {
            "pid": int(pid_dir.name),
            "comm": comm,
            "exe": exe,
            "uid": int(uid_field.split()[0]) if uid_field.split() else 0,
            "cap_effective_hex": status.get("CapEff", "0"),
            "seccomp_mode": int(status.get("Seccomp", "0") or 0),
            "no_new_privs": status.get("NoNewPrivs", "0") == "1",
            "unit": unit,
            "open_paths": sorted(open_paths),
        }
    except FileNotFoundError:
        skips.append({"source": f"process:{pid_dir.name}", "reason": "exited during scan"})
        return None
    except PermissionError as exc:
        skips.append({"source": f"process:{pid_dir.name}", "reason": f"permission denied: {exc}"})
        return None


def enumerate_processes(skips: list[dict[str, str]] | None = None) -> list[dict[str, object]]:
    """Return evidence dicts for every userspace process on the host."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    processes: list[dict[str, object]] = []
    try:
        entries = sorted(os.listdir(PROC))
    except OSError as exc:
        skipped.append({"source": "process:/proc", "reason": str(exc)})
        return []
    for name in entries:
        if not PID_DIR.match(name):
            continue
        record = read_process(PROC / name, skipped)
        if record is not None:
            processes.append(record)
    return sorted(processes, key=lambda p: int(p["pid"]))


def sanitize_id(raw: str) -> str:
    """Turn a unit or command name into a safe workload id suffix."""
    cleaned = re.sub(r"[^a-zA-Z0-9_.@-]+", "_", raw).strip("_")
    return cleaned or "unknown"


def group_workloads(processes: list[dict[str, object]]) -> list[dict[str, object]]:
    """Group process records into workloads by systemd unit, else comm.

    Workload ids are deterministic ("w.<unit|comm>"); pids, capabilities
    and touched device paths are unions across member processes.
    """
    grouped: dict[str, list[dict[str, object]]] = {}
    for proc in processes:
        unit = proc.get("unit")
        key_source = unit if unit else f"{proc['comm']}:{proc['exe']}"
        grouped.setdefault(key_source, []).append(proc)

    workloads: list[dict[str, object]] = []
    for key in sorted(grouped):
        members = grouped[key]
        primary = members[0]
        unit_value = primary.get("unit")
        label = unit_value if isinstance(unit_value, str) and unit_value else str(primary["comm"])
        caps: set[str] = set()
        for member in members:
            hexval = str(member.get("cap_effective_hex", "0"))
            try:
                value = int(hexval, 16)
            except ValueError:
                value = 0
            for bit in range(41):
                if value & (1 << bit):
                    caps.add(f"CAP_{bit}")
        workloads.append(
            {
                "id": f"w.{sanitize_id(key)}",
                "comm": str(primary["comm"]),
                "unit": unit_value if isinstance(unit_value, str) else None,
                "pids": sorted(int(m["pid"]) for m in members),
                "uid": min(int(m["uid"]) for m in members),
                "caps_effective": sorted(caps),
                "seccomp_mode": max(int(m["seccomp_mode"]) for m in members),
                "no_new_privs": all(bool(m["no_new_privs"]) for m in members),
                "open_paths": sorted({p for m in members for p in m["open_paths"]}),
            }
        )
    return workloads
