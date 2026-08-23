"""LLM explanation layer over a deterministic ksl report.

The LLM fills exactly four narrative fields and nothing else:
  ledger[].explanation
  plan[].breakage_note / plan[].detection / plan[].revert
and may re-render plan[].artifact.content.

It never influences a weight, gate, score, or ordering: this module
only ever writes string values into the report it was handed, and on
any error, timeout, or missing API key it silently keeps the
deterministic template content already present. Configuration comes
from the environment only:
  KSL_API_BASE   e.g. https://api.openai.com/v1
  KSL_API_KEY    bearer token
  KSL_MODEL      e.g. gpt-4o-mini

Every response is cached to explain/cache/<sha256(prompt)>.json so a
demo works offline; cache hits never touch the network.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = ROOT / "explain" / "prompts"
CACHE_DIR = ROOT / "explain" / "cache"

TIMEOUT_SECONDS = 60


# --------------------------------------------------------------------------
# prompt rendering


def _render(template_name: str, variables: dict[str, str]) -> str:
    """Fill {{var}} placeholders in a prompt template."""
    text = (PROMPTS_DIR / template_name).read_text()
    for key, value in variables.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def _element_notes(report: dict, element_ids: list[str]) -> str:
    """One compact line per element id, for the blame prompt."""
    by_id = {e["id"]: e for e in report["surface_elements"]}
    lines = []
    for eid in sorted(set(element_ids)):
        e = by_id.get(eid)
        if e is None:
            continue
        cves = ",".join(e["cve_clusters"]) or "none"
        lines.append(
            f"{eid} ({e['kind']}, weight {e['weight']}, "
            f"used={e['used']}): CVE clusters {cves}"
        )
    return "\n".join(lines)


def _workload_summary(report: dict, element_ids: list[str]) -> str:
    """Comma-separated list of workloads touching the given elements."""
    wanted = set(element_ids)
    return ", ".join(
        f"{w['comm']} ({len(w['pids'])} pids)"
        for w in sorted(report["workloads"], key=lambda w: w["id"])
        if wanted & set(w["touches"])
    ) or "no live workload touches these"


# --------------------------------------------------------------------------
# OpenAI-compatible chat client


def _chat(prompt: str, base: str, key: str, model: str) -> str | None:
    """POST one chat completion; return the message content or None."""
    url = base.rstrip("/") + "/chat/completions"
    payload = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode()
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = json.loads(response.read())
            return body["choices"][0]["message"]["content"]
    except (
        OSError,
        urllib.error.URLError,
        KeyError,
        IndexError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
    ):
        return None


def _cached_or_fetch(prompt: str) -> str | None:
    """Return the LLM answer for this exact prompt, via disk cache."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(prompt.encode()).hexdigest()
    cache_file = CACHE_DIR / f"{digest}.json"
    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text())
            if isinstance(cached, str):
                return cached
        except (OSError, json.JSONDecodeError, ValueError):
            pass
    base = os.environ.get("KSL_API_BASE", "")
    key = os.environ.get("KSL_API_KEY", "")
    model = os.environ.get("KSL_MODEL", "")
    if not (base and key and model):
        return None
    answer = _chat(prompt, base, key, model)
    if answer is not None:
        cache_file.write_text(json.dumps(answer))
    return answer


# --------------------------------------------------------------------------
# per-field explainers


def _explain_ledger_row(row: dict, report: dict) -> str:
    """Narrate one ledger row; empty string on any failure."""
    prompt = _render(
        "blame.md",
        {
            "comm": row["workload_id"],
            "unit": next(
                (w.get("unit", "") for w in report["workloads"] if w["id"] == row["workload_id"]),
                "",
            ),
            "uid": str(
                next(
                    (w.get("uid", -1) for w in report["workloads"] if w["id"] == row["workload_id"]),
                    -1,
                )
            ),
            "surface_debt": str(row["surface_debt"]),
            "sole_owner_elements": ", ".join(sorted(row["sole_owner_elements"])) or "(none)",
            "shared_elements": ", ".join(sorted(row["shared_elements"])) or "(none)",
            "reachable_cves": str(row["reachable_cves"]),
            "element_notes": _element_notes(
                report, row["sole_owner_elements"] + row["shared_elements"]
            )
            or "(none)",
        },
    )
    return (_cached_or_fetch(prompt) or "").strip()


def _explain_plan_step(step: dict, report: dict) -> None:
    """Fill breakage_note/detection/revert in place, keeping template fallback."""
    is_orphaned = all(t in report["orphaned"]["elements"] for t in step["targets"])
    prompt = _render(
        "breakage.md",
        {
            "action": step["action"],
            "targets": ", ".join(step["targets"]),
            "workload_summary": _workload_summary(report, step["targets"]),
            "is_orphaned": "yes" if is_orphaned else "no",
        },
    )
    raw_answer = _cached_or_fetch(prompt)
    if raw_answer is None:
        return
    try:
        parsed = json.loads(raw_answer)
    except json.JSONDecodeError:
        return
    if not isinstance(parsed, dict):
        return
    # Only string fields are overwritten, and only with strings. The
    # deterministic values stay when the model returns nothing usable.
    if isinstance(parsed.get("breakage_note"), str) and parsed["breakage_note"].strip():
        step["breakage_note"] = parsed["breakage_note"].strip()
    if isinstance(parsed.get("detection"), str) and parsed["detection"].strip():
        step["detection"] = parsed["detection"].strip()
    if isinstance(parsed.get("revert"), str) and parsed["revert"].strip():
        step["revert"] = parsed["revert"].strip()


# --------------------------------------------------------------------------
# entry points


def explain_report(report: dict, artifacts: bool = True) -> dict:
    """Return a copy of the report with narrative fields filled by the LLM.

    Numeric fields are structurally incapable of changing: only
    ledger[].explanation, plan[].breakage_note/detection/revert and
    (optionally) plan[].artifact.content are ever written.
    """
    enriched = json.loads(json.dumps(report))

    for row in enriched["ledger"]:
        row["explanation"] = _explain_ledger_row(row, enriched)

    for step in enriched["plan"]:
        _explain_plan_step(step, enriched)

    if artifacts:
        from explain.artifacts_llm import maybe_render_artifact

        for step in enriched["plan"]:
            maybe_render_artifact(step, enriched, _cached_or_fetch)

    return enriched


def main(argv: list[str] | None = None) -> int:
    """CLI: python -m explain.explain -i report.json [-o out.json]."""
    import argparse

    from ksl_env import load_dotenv

    load_dotenv()  # explicit env vars always win over .env
    parser = argparse.ArgumentParser(description="Add LLM explanations to a ksl report")
    parser.add_argument("-i", "--input", required=True, help="input report.json")
    parser.add_argument("-o", "--output", help="output path (default: overwrite input)")
    parser.add_argument(
        "--no-artifacts",
        action="store_true",
        help="do not let the LLM re-render plan artifact contents",
    )
    args = parser.parse_args(argv)

    report = json.loads(Path(args.input).read_text())
    enriched = explain_report(report, artifacts=not args.no_artifacts)
    out_path = Path(args.output or args.input)
    out_path.write_text(json.dumps(enriched, indent=2, sort_keys=True) + "\n")
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
