"""Minimal .env loader (stdlib only).

Reads KEY=VALUE pairs from a .env file at the repo root into os.environ.
Existing environment variables always win, so an explicit
``export KSL_API_KEY=...`` overrides whatever is in .env. The .env file
is gitignored; .env.example is the committed template.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_dotenv(path: Path | None = None) -> bool:
    """Load KEY=VALUE lines from path (default: repo-root .env) into environ.

    Returns True if a file was loaded. Blank lines and # comments are
    ignored; values may be quoted with single or double quotes. Existing
    environment variables are never overwritten.
    """
    env_file = path or ROOT / ".env"
    if not env_file.is_file():
        return False
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value
    return True
