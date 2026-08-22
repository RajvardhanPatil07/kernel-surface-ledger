"""Read-only kernel configuration parser.

Parses the running kernel's build-time configuration from /proc/config.gz
when available, falling back to /boot/config-$(uname -r). Returns a flat
mapping of CONFIG_* symbols to their tristate value ("y", "m" or "n").
"""

from __future__ import annotations

import gzip
import platform
import re
from pathlib import Path

CONFIG_LINE = re.compile(r"^CONFIG_([A-Z0-9_]+)=([ymn])$")


def parse_config_text(text: str) -> dict[str, str]:
    """Parse config-file text into a {CONFIG_*: y|m|n} dict.

    Lines that are comments, blank, or set values other than y/m/n
    (strings, integers, hex) are ignored: reachability logic only ever
    asks about tristate symbols.
    """
    result: dict[str, str] = {}
    for line in text.splitlines():
        match = CONFIG_LINE.match(line.strip())
        if match:
            result[f"CONFIG_{match.group(1)}"] = match.group(2)
    return result


def _candidate_paths() -> list[Path]:
    """Return candidate config sources in preference order."""
    release = platform.release()
    return [
        Path("/proc/config.gz"),
        Path(f"/boot/config-{release}"),
    ]


def read_config_text(skips: list[dict[str, str]] | None = None) -> str | None:
    """Read raw config text from the first readable source.

    Records every failed source in `skips` as {"source", "reason"} and
    returns None when no source is readable.
    """
    skipped: list[dict[str, str]] = [] if skips is None else skips
    for path in _candidate_paths():
        try:
            if path.name.endswith(".gz"):
                with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
                    return fh.read()
            return path.read_text(encoding="utf-8", errors="replace")
        except FileNotFoundError:
            skipped.append({"source": f"kconfig:{path}", "reason": "not present"})
        except PermissionError as exc:
            skipped.append({"source": f"kconfig:{path}", "reason": f"permission denied: {exc}"})
        except OSError as exc:
            skipped.append({"source": f"kconfig:{path}", "reason": str(exc)})
    return None


def parse_kconfig(skips: list[dict[str, str]] | None = None) -> dict[str, str]:
    """Return the running kernel's tristate config symbols.

    Degrades to an empty mapping when neither /proc/config.gz nor the
    matching /boot config file can be read; every failure is recorded.
    """
    text = read_config_text(skips)
    if text is None:
        return {}
    return parse_config_text(text)
