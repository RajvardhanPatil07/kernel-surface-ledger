#!/usr/bin/env python3
"""Unified CLI for kernel-surface-ledger: one command, full pipeline.

    python ksl.py scan                          # live host -> report.json
    python ksl.py scan --raw raw.json           # re-score an existing snapshot
    python ksl.py scan --no-explain             # skip every LLM call

The scored output is deterministic and LLM-independent either way:
``--no-explain`` changes narrative fields only, never a number. That
invariant is enforced by tests/test_explain.py.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


from ksl_env import load_dotenv


def load_curated() -> tuple[dict, dict]:
    """Load the human-curated weights and CVE map."""
    import yaml

    weights = yaml.safe_load((ROOT / "data" / "weights.yaml").read_text())
    cve_map = json.loads((ROOT / "data" / "cve-map.json").read_text())
    return weights, cve_map


def _load_json(path: str) -> dict:
    """Load a JSON file, exiting with a friendly message on failure."""
    try:
        return json.loads(Path(path).read_text())
    except FileNotFoundError:
        print(f"error: {path} does not exist", file=sys.stderr)
    except IsADirectoryError:
        print(f"error: {path} is a directory, not a file", file=sys.stderr)
    except json.JSONDecodeError as exc:
        print(f"error: {path} is not valid JSON: {exc}", file=sys.stderr)
    raise SystemExit(1)


def cmd_scan(args: argparse.Namespace) -> int:
    """Collect (or reuse) a snapshot, score it, optionally narrate it."""
    load_dotenv()  # explicit env vars always win over .env
    from collector.collect import collect_raw
    from engine import report as report_engine

    if args.raw:
        raw = _load_json(args.raw)
        source = f"snapshot {args.raw}"
    else:
        raw = collect_raw()
        source = "live host"
        if args.save_raw:
            Path(args.save_raw).write_text(
                json.dumps(raw, indent=2, sort_keys=True) + "\n"
            )
            print(f"wrote raw snapshot to {args.save_raw}")

    weights, cve_map = load_curated()
    report = report_engine.build_report(raw, weights, cve_map)

    if args.explain:
        import explain.explain as ex

        report = ex.explain_report(report, artifacts=not args.no_artifacts)

    out = Path(args.output)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    report_engine.validate_report(report)

    score = report["score"]
    print(f"report: {out}  ({source}, explain={'on' if args.explain else 'off'})")
    print(
        f"  reachable surface weight : {score['reachable_surface_weight']}"
        f"\n  reachable CVEs           : {score['reachable_cve_count']}"
        f"  -> after plan: {score['projected_after_plan']['reachable_cve_count']}"
        f"\n  orphan ratio             : {score['orphan_ratio']}"
        f"\n  ledger rows              : {len(report['ledger'])}"
        f"\n  plan steps               : {len(report['plan'])}"
        f"\n  orphaned elements        : {len(report['orphaned']['elements'])}"
    )
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    """Validate a report against the frozen schema and recompute invariants."""
    from engine.report import validate_report

    report = _load_json(args.report)
    try:
        validate_report(report)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1
    print(f"ok: {args.report} satisfies report.schema.json")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ksl", description=__doc__)
    parser.add_argument("--version", action="store_true", help="print version and exit")
    sub = parser.add_subparsers(dest="command")
    sub.required = False

    scan = sub.add_parser("scan", help="collect, score, and narrate a host")
    scan.add_argument("-o", "--output", default="report.json", help="output report path")
    scan.add_argument("--raw", help="score an existing raw snapshot instead of scanning live")
    scan.add_argument("--save-raw", help="also save the raw snapshot to this path")
    scan.add_argument(
        "--no-explain",
        dest="explain",
        action="store_false",
        help="skip all LLM calls (numeric output is identical)",
    )
    scan.add_argument("--no-artifacts", action="store_true",
                      help="do not let the LLM re-render plan artifact contents")
    scan.set_defaults(func=cmd_scan)

    check = sub.add_parser("check", help="validate a report against the schema contract")
    check.add_argument("report", help="path to report.json")
    check.set_defaults(func=cmd_check)

    args = parser.parse_args(argv)
    if getattr(args, "version", False):
        from collector.collect import KSL_VERSION

        print(KSL_VERSION)
        return 0
    if args.command is None:
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
