"""Report assembly and schema validation.

Assembles the final report dict from raw evidence plus the curated
tables, validates it against the frozen report.schema.json, and keeps
the whole pipeline deterministic: no randomness, sorted collections
everywhere, explanations empty until the (optional) LLM layer fills
them without touching a single scored field.
"""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft7Validator

from engine import attribution, reachability, setcover
from engine.report_cves import count_reachable_cves

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "report.schema.json"


def load_schema() -> dict:
    """Load the frozen contract schema."""
    return json.loads(SCHEMA_PATH.read_text())


def validate_report(report: dict) -> None:
    """Raise ValueError listing every schema violation, if any."""
    errors = sorted(Draft7Validator(load_schema()).iter_errors(report), key=lambda e: list(e.path))
    if errors:
        details = "\n".join(f"  {list(e.path)}: {e.message}" for e in errors)
        raise ValueError(f"report violates report.schema.json:\n{details}")


def build_score(elements: list[dict], orphaned: dict, cve_map: dict) -> dict:
    """Headline numbers derived strictly from surface_elements."""
    total = sum(element["weight"] for element in elements)
    reachable = sum(element["weight"] for element in elements if element["reachable_unpriv"])
    ratio = orphaned["total_weight"] / max(reachable, 1.0)
    return {
        "total_surface_weight": round(total, 2),
        "reachable_surface_weight": round(reachable, 2),
        "reachable_cve_count": count_reachable_cves(elements, cve_map),
        "orphan_ratio": round(ratio, 3),
    }


def build_report(raw: dict, weights: dict, cve_map: dict) -> dict:
    """Run the full deterministic pipeline and return the validated report."""
    elements = reachability.compute_elements(raw, weights)
    workloads = reachability.annotate_workloads(raw, elements)

    raw_backend = raw.get("meta", {}).get("trace_backend", "none")
    # An unrecognised backend value must not kill the report, and must not
    # be trusted as evidence that syscall usage was observed.
    trace_backend = raw_backend if raw_backend in ("bcc", "perf", "strace", "none") else "none"
    ledger = attribution.compute_ledger(elements, workloads, cve_map)
    orphaned = attribution.compute_orphaned(elements, trace_backend, cve_map)
    plan = setcover.build_plan(elements, workloads, orphaned, cve_map)
    projection = setcover.project_after_plan(elements, plan, cve_map)

    report: dict = {
        "meta": {
            "kernel_release": raw["meta"]["kernel_release"],
            "arch": raw["meta"]["arch"],
            "distro": raw["meta"]["distro"],
            "collected_at": raw["meta"]["collected_at"],
            "trace_seconds": raw["meta"].get("trace_seconds", 0),
            "trace_backend": trace_backend,
            "ran_as_root": bool(raw["meta"].get("ran_as_root", False)),
            "skipped": sorted(
                raw["meta"].get("skipped", []), key=lambda s: (s["source"], s["reason"])
            ),
            "ksl_version": raw["meta"].get("ksl_version", "0.0.0"),
        },
        "surface_elements": [
            {
                "id": e["id"],
                "kind": e["kind"],
                "name": e["name"],
                "subsystem": e["subsystem"],
                "weight": e["weight"],
                "present": e["present"],
                "reachable_unpriv": e["reachable_unpriv"],
                "used": e["used"],
                "gate_reason": e["gate_reason"],
                "cve_clusters": e["cve_clusters"],
                "mitigations": e["mitigations"],
            }
            for e in elements
        ],
        "workloads": workloads,
        "ledger": ledger,
        "orphaned": orphaned,
        "plan": plan,
        "score": {
            **build_score(elements, orphaned, cve_map),
            "projected_after_plan": projection,
        },
    }
    validate_report(report)
    return report
