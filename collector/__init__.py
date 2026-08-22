"""kernel-surface-ledger collector.

Strictly read-only evidence gathering from /proc, /sys and /boot.
Never loads or unloads a module, never writes outside the explicit
output path, degrades to a partial snapshot with reasons recorded in
meta.skipped when run as an unprivileged user.
"""
