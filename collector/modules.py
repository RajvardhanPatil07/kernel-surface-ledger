"""Loaded and autoloadable kernel module discovery.

`loaded_modules` parses /proc/modules. `available_modules` walks
/lib/modules/$(uname -r)/modules.dep so that "not loaded but one socket()
call away via autoload" can be distinguished from "cannot be loaded at
all" — the distinction the whole reachability model depends on.
"""

from __future__ import annotations

import platform
from pathlib import Path

PROC_MODULES = Path("/proc/modules")


def parse_proc_modules(text: str) -> list[dict[str, object]]:
    """Parse /proc/modules text into per-module dicts.

    Each line is: name size instance_count dependencies state address.
    Only name and instance_count matter downstream; instance_count above
    zero means something in the kernel holds the module open.
    """
    entries: list[dict[str, object]] = []
    for line in text.splitlines():
        fields = line.split()
        if len(fields) < 4:
            continue
        try:
            instances = int(fields[2])
        except ValueError:
            continue
        entries.append({"name": fields[0], "instances": instances})
    return sorted(entries, key=lambda entry: str(entry["name"]))


def loaded_modules(skips: list[dict[str, str]] | None = None) -> list[dict[str, object]]:
    """Return modules currently loaded into the running kernel."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    try:
        text = PROC_MODULES.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        skipped.append({"source": "modules:/proc/modules", "reason": "not present"})
        return []
    except PermissionError as exc:
        skipped.append({"source": "modules:/proc/modules", "reason": f"permission denied: {exc}"})
        return []
    except OSError as exc:
        skipped.append({"source": "modules:/proc/modules", "reason": str(exc)})
        return []
    return parse_proc_modules(text)


def parse_modules_dep(text: str) -> list[str]:
    """Parse a modules.dep file into a sorted list of module names.

    Keys are object paths such as kernel/net/dccp/dccp.ko.xz; every key
    becomes autoloadable once it appears here, regardless of extension
    compression suffix.
    """
    names: set[str] = set()
    for line in text.splitlines():
        path = line.split(":", 1)[0].strip()
        if not path:
            continue
        stem = Path(path).name.split(".")[0]
        if stem:
            names.add(stem)
    return sorted(names)


def available_modules(skips: list[dict[str, str]] | None = None) -> list[str]:
    """Return all modules loadable on this kernel (the modules.dep universe)."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    dep = Path("/lib/modules") / platform.release() / "modules.dep"
    try:
        text = dep.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        skipped.append({"source": "modules:modules.dep", "reason": "not present"})
        return []
    except PermissionError as exc:
        skipped.append({"source": "modules:modules.dep", "reason": f"permission denied: {exc}"})
        return []
    except OSError as exc:
        skipped.append({"source": "modules:modules.dep", "reason": str(exc)})
        return []
    return parse_modules_dep(text)
