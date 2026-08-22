"""Counterfactual hardening planner: greedy weighted set cover.

Candidates come from each reachable element's curated mitigations.
Steps are chosen to maximise newly-neutralised CVE mass per unit of
estimated breakage cost, batching mitigations that share one artifact
file. The plan is advisory output for human review; nothing here is
ever applied to the host.
"""

from __future__ import annotations

import re

from artifacts import templates
from engine.attribution import cve_ids
from engine.reachability import MODULE_MEMBERS

ACTION_RULES: tuple[tuple[str, str], ...] = (
    ("modprobe blacklist", "blacklist_module"),
    ("blacklist", "blacklist_module"),
    ("seccomp deny", "seccomp_filter"),
    ("sysctl", "sysctl_set"),
    ("kconfig", "kconfig_disable"),
    ("RestrictNamespaces=", "systemd_confine"),
    ("NoNewPrivileges", "systemd_confine"),
    ("restrict group", "remove_devnode_access"),
)

BATCHABLE_ACTIONS = {"blacklist_module", "sysctl_set"}

ARTIFACT_PATHS = {
    "blacklist_module": "/etc/modprobe.d/ksl-blacklist.conf",
    "sysctl_set": "/etc/sysctl.d/99-ksl-hardening.conf",
}

REVERT_TEMPLATES = {
    "blacklist_module": "rm /etc/modprobe.d/ksl-blacklist.conf && update-initramfs -u",
    "seccomp_filter": "remove the seccomp profile from the unit and restart it",
    "sysctl_set": "rm /etc/sysctl.d/99-ksl-hardening.conf && sysctl --system",
    "kconfig_disable": "revert the config fragment and rebuild/reinstall the kernel",
    "systemd_confine": "rm /etc/systemd/system/<unit>.d/ksl-confine.conf && systemctl daemon-reload",
    "remove_devnode_access": "remove the udev rule and run udevadm control --reload",
}

DETECTION_TEMPLATES = {
    "blacklist_module": "modprobe <target>; systemctl --failed; journalctl -p err -b --no-pager | tail -50",
    "seccomp_filter": "journalctl -u <unit> -b | grep -i 'bad system call'",
    "sysctl_set": "sysctl kernel.perf_event_paranoid kernel.kptr_restrict kernel.dmesg_restrict",
    "kconfig_disable": "grep <CONFIG> /boot/config-$(uname -r)",
    "systemd_confine": "systemd-analyze security <unit>",
    "remove_devnode_access": "ls -l <devnode>; virsh list --all",
}

MAX_STEPS = 5

COST_ORPHANED = 1
COST_IN_USE = 4
COST_KCONFIG = 12

HOST_WIDE_ACTIONS = frozenset(
    {"blacklist_module", "sysctl_set", "kconfig_disable", "remove_devnode_access"}
)


def _action_for(mitigation: str) -> str | None:
    """Map one mitigation string to a plan action, first rule wins."""
    lowered = mitigation.lower()
    for pattern, action in ACTION_RULES:
        if pattern.lower() in lowered:
            return action
    return None


def _candidates(elements: list[dict]) -> list[dict]:
    """Reachable elements with at least one recognised mitigation."""
    candidates: list[dict] = []
    for element in sorted(elements, key=lambda e: e["id"]):
        if not element["reachable_unpriv"]:
            continue
        actions = {a for m in element["mitigations"] if (a := _action_for(str(m)))}
        if actions:
            best = sorted(actions)[0]
            candidates.append({"element": element, "action": best})
    return candidates


def _group_key(candidate: dict) -> tuple[str, str]:
    """Batch key: batchable actions share one artifact file."""
    eid = candidate["element"]["id"]
    action = candidate["action"]
    if action in BATCHABLE_ACTIONS:
        return action, "batched"
    return action, eid


SYSCTL_SETTING = re.compile(r"sysctl\s+([a-z][\w.]+)\s*=\s*(\S+)")
SECCOMP_DENY = re.compile(r"seccomp\s+deny\s+([\w,\s]+)")


def _effective_targets(eid: str, element_by_id: dict[str, dict]) -> list[str]:
    """Expand an element id into concrete target names for artifacts.

    Composite module entries (e.g. the legacy filesystem bundle) expand
    to their member modules; everything else uses its curated name.
    """
    if eid in MODULE_MEMBERS:
        return sorted(MODULE_MEMBERS[eid])
    return [element_by_id[eid]["name"]]


def _sysctl_settings(members: list[dict]) -> dict[str, str]:
    """Extract exact key=value settings from members' sysctl mitigations."""
    settings: dict[str, str] = {}
    for candidate in members:
        for mitigation in candidate["element"]["mitigations"]:
            match = SYSCTL_SETTING.search(str(mitigation))
            if match:
                settings[match.group(1)] = match.group(2)
    return dict(sorted(settings.items()))


def _seccomp_denied(members: list[dict]) -> list[str]:
    """Extract denied syscall names from members' seccomp mitigations."""
    denied: set[str] = set()
    for candidate in members:
        for mitigation in candidate["element"]["mitigations"]:
            match = SECCOMP_DENY.search(str(mitigation))
            if match:
                denied.update(
                    name.strip() for name in match.group(1).split(",") if name.strip()
                )
    return sorted(denied)


def _artifact_content(action: str, targets: list[str], members: list[dict]) -> str:
    """Render artifact content with action-specific precision."""
    if action == "sysctl_set":
        settings = _sysctl_settings(members)
        return templates.sysctl_fragment(settings) if settings else templates.render(action, targets)
    if action == "seccomp_filter":
        denied = _seccomp_denied(members)
        unit = members[0]["element"]["subsystem"] if members else "service"
        return templates.seccomp_json(unit or "service", denied or targets)
    return templates.render(action, targets)


def build_plan(
    elements: list[dict],
    workloads: list[dict],
    orphaned: dict,
    cve_map: dict,
) -> list[dict]:
    """Greedy set cover over CVE clusters, ordered by coverage per cost."""
    orphaned_ids = set(orphaned["elements"])
    weight_of = {element["id"]: element["weight"] for element in elements}
    name_of = {element["id"]: element["name"] for element in elements}
    used_of = {element["id"]: element["used"] for element in elements}

    groups: dict[tuple[str, str], list[dict]] = {}
    for candidate in _candidates(elements):
        groups.setdefault(_group_key(candidate), []).append(candidate)

    covered_ids: set[str] = set()
    covered_hostwide_ids: set[str] = set()
    element_by_id = {element["id"]: element for element in elements}
    plan: list[dict] = []
    step_no = 1

    while step_no <= MAX_STEPS and len(groups) > 0:
        best: tuple[float, str, str] | None = None
        chosen_new: set[str] = set()
        for key in sorted(groups):
            members = groups[key]
            target_ids = [c["element"]["id"] for c in members]
            new_elements = [eid for eid in target_ids if eid not in covered_ids]
            if not new_elements:
                continue
            action = key[0]
            new_clusters: set[str] = set()
            for eid in new_elements:
                new_clusters.update(element_by_id[eid]["cve_clusters"])
            already_neutralized = (
                _clusters_of(covered_hostwide_ids, elements)
                if action in HOST_WIDE_ACTIONS
                else _clusters_of(covered_ids, elements)
            )
            new_cves = cve_ids(sorted(new_clusters - already_neutralized), cve_map)
            all_orphaned = all(eid in orphaned_ids or used_of[eid] is False for eid in new_elements)
            base = COST_KCONFIG if action == "kconfig_disable" else (
                COST_ORPHANED if all_orphaned else COST_IN_USE
            )
            ratio = (len(new_cves) / base) if base else 0.0
            rank = (-ratio, action, ",".join(target_ids))
            if best is None or rank < best:
                best = rank
                chosen_action = action
                chosen_targets = target_ids
                chosen_new_cves = new_cves
                chosen_new_elements = new_elements
        if best is None or len(chosen_new_cves) == 0:
            break

        all_orphaned = all(eid in orphaned_ids or used_of[eid] is False for eid in chosen_new_elements)
        breakage_risk = "none" if all_orphaned and chosen_action != "kconfig_disable" else "low"
        host_wide = chosen_action in HOST_WIDE_ACTIONS
        weight_removed = sum(weight_of[e] for e in chosen_new_elements) if host_wide else 0.0
        if chosen_action == "sysctl_set":
            settings = _sysctl_settings(groups[(chosen_action, "batched")])
            effective_targets = (
                sorted(f"{key}={value}" for key, value in settings.items())
                if settings
                else sorted({name_of.get(eid, eid) for eid in chosen_targets})
            )
        else:
            effective_targets = sorted(
                {
                    target
                    for eid in chosen_targets
                    for target in _effective_targets(eid, element_by_id)
                }
            )
        plan.append(
            {
                "step": step_no,
                "action": chosen_action,
                "targets": effective_targets,
                "cves_killed": len(chosen_new_cves),
                "weight_removed": round(weight_removed, 2),
                "breakage_risk": breakage_risk,
                "breakage_note": _breakage_note(breakage_risk),
                "detection": DETECTION_TEMPLATES[chosen_action],
                "requires_reboot": chosen_action == "kconfig_disable",
                "artifact": {
                    "path": ARTIFACT_PATHS.get(chosen_action, f"/etc/ksl/{chosen_action}.conf"),
                    "content": _artifact_content(
                        chosen_action,
                        effective_targets,
                        groups[(chosen_action, "batched" if chosen_action in BATCHABLE_ACTIONS else chosen_targets[0])],
                    ),
                },
                "revert": REVERT_TEMPLATES[chosen_action],
            }
        )
        covered_ids.update(chosen_new_elements)
        if chosen_action in HOST_WIDE_ACTIONS:
            covered_hostwide_ids.update(chosen_new_elements)
        step_no += 1

    return plan


def _clusters_of(element_ids: set[str], elements: list[dict]) -> set[str]:
    """Union of CVE cluster names over the given element ids."""
    by_id = {element["id"]: element for element in elements}
    return {cluster for eid in element_ids for cluster in by_id[eid]["cve_clusters"]}


def _breakage_note(risk: str) -> str:
    """One honest sentence about what could break."""
    if risk == "none":
        return "Every target is orphaned: no live workload touched any of them during the observation window."
    return (
        "Some targets are in active use or are policy changes with future-facing "
        "effects; review each target before applying."
    )


def project_after_plan(elements: list[dict], plan: list[dict], cve_map: dict) -> dict:
    """Recompute the headline score as if every host-wide step had applied.

    Everything here is in concrete-CVE-id space. Per-service steps
    (seccomp filters, systemd confinements) remove a pivot for one
    workload without making the element unreachable host-wide, so they
    deliberately contribute nothing to this projection.
    """
    from engine.report_cves import count_reachable_cves

    current_cves = count_reachable_cves(elements, cve_map)
    current_weight = sum(e["weight"] for e in elements if e["reachable_unpriv"])
    removed_weight = sum(step["weight_removed"] for step in plan)
    killed = sum(
        step["cves_killed"] for step in plan if step["action"] in HOST_WIDE_ACTIONS
    )
    return {
        "reachable_surface_weight": round(max(current_weight - removed_weight, 0.0), 2),
        "reachable_cve_count": max(current_cves - killed, 0),
    }
