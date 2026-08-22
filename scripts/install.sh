#!/usr/bin/env sh
# Kernel Surface Ledger installer.
#
# Read-only tool: it inspects /proc, /sys and /boot and writes a single JSON
# report. It never loads a module, never changes a sysctl, and never applies the
# hardening artifacts it generates.
set -eu

REPO="https://github.com/RajvardhanPatil07/kernel-surface-ledger"
DEST="${KSL_DEST:-$HOME/.local/share/kernel-surface-ledger}"

fail() { printf 'error: %s\n' "$1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"

python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' \
  || fail "python 3.11 or newer is required"

if [ -d "$DEST/.git" ]; then
  printf 'updating %s\n' "$DEST"
  git -C "$DEST" pull --ff-only
else
  printf 'cloning into %s\n' "$DEST"
  mkdir -p "$(dirname "$DEST")"
  git clone --depth 1 "$REPO" "$DEST"
fi

python3 -m venv "$DEST/.venv"
"$DEST/.venv/bin/pip" install --quiet --upgrade pip
"$DEST/.venv/bin/pip" install --quiet -r "$DEST/requirements.txt"

cat <<EOF

Installed to $DEST

Run a scan (no root required; more complete with it):

  cd $DEST
  .venv/bin/python -m collector.collect -o raw.json
  .venv/bin/python -m engine.report raw.json -o report.json

Then drop report.json onto the dashboard to view the ledger.
EOF
