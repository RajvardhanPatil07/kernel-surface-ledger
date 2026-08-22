"""Device-node exposure checks.

For the device nodes named in the curated risk table, records mode,
owner and whether a non-root local user could open it. This is one of
the three inputs to the reachable_unpriv gate.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

INTERESTING_DEVICES: tuple[str, ...] = (
    "/dev/mem",
    "/dev/kmem",
    "/dev/kvm",
    "/dev/bpf",
    "/dev/dri/card0",
    "/dev/fuse",
    "/dev/net/tun",
)


def describe_device(path: str, skips: list[dict[str, str]] | None = None) -> dict[str, object] | None:
    """Stat one device node into an evidence dict, or None if absent."""
    skipped: list[dict[str, str]] = [] if skips is None else skips
    try:
        info = os.stat(path)
    except FileNotFoundError:
        skipped.append({"source": f"devnode:{path}", "reason": "not present"})
        return None
    except PermissionError as exc:
        skipped.append({"source": f"devnode:{path}", "reason": f"permission denied: {exc}"})
        return None
    except OSError as exc:
        skipped.append({"source": f"devnode:{path}", "reason": str(exc)})
        return None
    mode = stat.S_IMODE(info.st_mode)
    return {
        "path": path,
        "mode_octal": f"{mode:04o}",
        "uid": info.st_uid,
        "gid": info.st_gid,
        "nonroot_read": bool((mode & stat.S_IRGRP) or (mode & stat.S_IROTH)),
        "nonroot_write": bool((mode & stat.S_IWGRP) or (mode & stat.S_IWOTH)),
    }


def collect_devnodes(
    paths: tuple[str, ...] = INTERESTING_DEVICES,
    skips: list[dict[str, str]] | None = None,
) -> dict[str, dict[str, object]]:
    """Return evidence for every interesting device node that exists."""
    result: dict[str, dict[str, object]] = {}
    for path in sorted(paths):
        described = describe_device(path, skips)
        if described is not None:
            result[path] = described
    return result
