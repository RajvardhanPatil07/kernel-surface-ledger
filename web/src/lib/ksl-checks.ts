/**
 * Turns a hardening plan step into commands a Linux beginner can paste, each
 * with a plain-language reading of what the output means. Everything here is
 * derived from the report itself — no invented knobs, no invented ids.
 */

import { resolveTarget } from "./ksl-report";
import type { KslPlanStep, KslReport, KslSurfaceElement } from "./ksl-types";

export interface CheckItem {
  /** what the command is for, in one short phrase */
  label: string;
  command: string;
  /** what a "good" result looks like, in plain words */
  pass: string;
  /** what it means when you see something else */
  fail: string;
}

/** `kernel.perf_event_paranoid=2` inside a gate reason → the sysctl key. */
function sysctlKeyFromGate(reason?: string): string | null {
  const m = /([a-z0-9_]+(?:\.[a-z0-9_]+)+)\s*=/i.exec(reason ?? "");
  return m ? (m[1] ?? null) : null;
}

function elementChecks(el: KslSurfaceElement): CheckItem[] {
  if (el.kind === "module") {
    return [
      {
        label: `module ${el.name} is not loaded`,
        command: `lsmod | grep -w ${el.name} || echo "not loaded"`,
        pass: `You see "not loaded". The module is out of the kernel, so its bugs cannot be reached.`,
        fail: `A line of output means ${el.name} is still loaded. Unload it with "sudo modprobe -r ${el.name}", or reboot if something is using it.`,
      },
      {
        label: `${el.name} can no longer autoload`,
        command: `modprobe -n -v ${el.name}`,
        pass: `You see "install /bin/false" (or an error). Nothing can pull the module in automatically any more.`,
        fail: `You see "insmod /lib/modules/.../${el.name}.ko". The blacklist did not take: check /etc/modprobe.d/ and re-run "sudo depmod -a".`,
      },
    ];
  }

  if (el.kind === "sysctl") {
    return [
      {
        label: `sysctl ${el.name} is set`,
        command: `sysctl ${el.name}`,
        pass: `The value printed matches what the plan step sets. The restriction is live right now.`,
        fail: `A different value means the setting was not applied, or something reset it. Re-apply, then run "sudo sysctl --system" to reload files in /etc/sysctl.d/.`,
      },
    ];
  }

  const gateKey = sysctlKeyFromGate(el.gate_reason);
  if (el.kind === "syscall" && gateKey) {
    return [
      {
        label: `${el.name} is gated by ${gateKey}`,
        command: `sysctl ${gateKey}`,
        pass: `The value shown is the restricted one, so an ordinary user can no longer use ${el.name}.`,
        fail: `An unrestricted value means ${el.name} is still reachable by any local user. Re-apply the step's artifact.`,
      },
    ];
  }

  if (el.kind === "devnode") {
    return [
      {
        label: `device ${el.name} permissions`,
        command: `ls -l ${el.name.startsWith("/") ? el.name : `/dev/${el.name}`}`,
        pass: `Only root (or a privileged group) has access in the permission column.`,
        fail: `World-readable or world-writable permissions mean any local user can still reach this device.`,
      },
    ];
  }

  return [
    {
      label: `${el.name} state`,
      command: `# no generic check exists for ${el.id} (${el.kind}) — use the step's own detection command`,
      pass: `Use the detection command above; this element kind has no standard one-liner.`,
      fail: `If the report shipped no detection command, this step cannot be verified from userspace alone.`,
    },
  ];
}

/** Every check for one plan step: its own detection first, then per-target. */
export function stepChecks(report: KslReport, step: KslPlanStep): CheckItem[] {
  const action = step.action.toLowerCase();
  const items: CheckItem[] = [];

  if (step.detection) {
    items.push({
      label: "the check shipped with this step",
      command: step.detection,
      pass: "Output matches what the step describes — the change is in effect on this host.",
      fail: "Empty or contradicting output means the change is not active yet. Apply the artifact, then run this again.",
    });
  }

  const seenCommands = new Set(items.map((i) => i.command));
  const add = (list: CheckItem[]) => {
    for (const item of list) {
      if (seenCommands.has(item.command)) continue;
      seenCommands.add(item.command);
      items.push(item);
    }
  };

  for (const target of step.targets) {
    // A blacklist step's targets are module names — check the module the
    // operator actually named, even when the report itemizes it as a group
    // (e.g. mod.legacy_fs covers cramfs, hfsplus, udf …).
    if (
      (action.includes("blacklist") || action.includes("module")) &&
      /^[a-z0-9_-]+$/i.test(target)
    ) {
      add([
        {
          label: `module ${target} is not loaded`,
          command: `lsmod | grep -w ${target} || echo "not loaded"`,
          pass: `You see "not loaded" — ${target} is out of the kernel.`,
          fail: `Output means ${target} is still loaded: run "sudo modprobe -r ${target}" (or reboot if it is in use).`,
        },
        {
          label: `${target} can no longer autoload`,
          command: `modprobe -n -v ${target}`,
          pass: `"install /bin/false" (or an error) — nothing can pull it in automatically.`,
          fail: `An "insmod …${target}.ko" line means the blacklist did not take: check /etc/modprobe.d/ and run "sudo depmod -a".`,
        },
      ]);
      continue;
    }

    // Targets can also be plain sysctl keys or `key=value` pairs.
    const key =
      sysctlKeyFromGate(target) ?? (/^[a-z0-9_]+\.[a-z0-9_.]+$/i.test(target) ? target : null);
    if (key) {
      add([
        {
          label: `sysctl ${key} is set`,
          command: `sysctl ${key}`,
          pass: "The printed value is the restricted one from this step.",
          fail: "A different value means the step is not applied on this host.",
        },
      ]);
      continue;
    }

    const el = resolveTarget(report, target);
    if (el) {
      add(elementChecks(el));
      continue;
    }

    if (action.includes("seccomp")) {
      const syscall = target.replace(/^sc\./, "");
      add([
        {
          label: `syscall ${syscall} is blocked for filtered services`,
          command: `grep -i seccomp /proc/self/status`,
          pass: "A Seccomp line of 2 on a filtered service's process means the syscall allowlist is loaded.",
          fail: "Seccomp 0 means no filter is active: run 'sudo systemctl daemon-reload' and restart the service the drop-in targets.",
        },
      ]);
    }
  }

  items.push({
    label: "nothing important broke",
    command: `systemctl --failed --no-legend; journalctl -p err -b --since "10 min ago" | tail -20`,
    pass: "No failed units and no new kernel/service errors — the change was safe on this host.",
    fail: `A failed unit or a new error right after the change is your signal to revert with: ${step.revert}`,
  });

  return items;
}
