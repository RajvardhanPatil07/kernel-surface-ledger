# Prior art, and what is actually new here

This document exists so that the contribution can be evaluated honestly. The
surrounding literature is mature; pretending otherwise would be worse than
useless.

## What already exists

| Work | What it does | Limitation we address |
| --- | --- | --- |
| [kernel-hardening-checker](https://github.com/a13xp0p0v/kernel-hardening-checker) | Audits Kconfig, sysctl, and cmdline against KSPP recommendations; generates a hardened Kconfig fragment | Static, global, workload-blind. Emits ~180 unranked findings with no notion of which are reachable or who caused them |
| [Kurmus et al., NDSS 2013](https://www.ibr.cs.tu-bs.de/users/kurmus/papers/kurmus-ndss13.pdf) | Attack surface metrics plus automated compile-time kernel tailoring | Whole-kernel aggregate metric; no per-workload attribution |
| [Quantifiable Run-Time Kernel Attack Surface Reduction](https://link.springer.com/content/pdf/10.1007/978-3-319-08509-8_12) | Reachability analysis over the kernel from syscall entry points | Single aggregate number; requires a tailored kernel |
| [Confine, RAID 2020](https://www.usenix.org/system/files/raid20-ghavamnia.pdf) | Static analysis to generate container syscall policies, counts CVEs neutralized | One container in isolation |
| Temporal System Call Specialization (USENIX Sec 2020), C2C (CCS 2022) | Phase- and configuration-aware syscall filtering | Per-application, requires LLVM-level analysis |
| [sysverify, 2025](https://arxiv.org/abs/2510.03720) | Static plus dynamic dependent-syscall analysis to shrink syscall surface | Per-application whitelist generation |
| [Chestnut, CCSW 2021](https://misc0110.net/files/chestnut_ccsw21.pdf) | Automated seccomp filter generation for Linux applications | Per-application; no risk model or planning layer |
| [OCI seccomp-bpf-hook](https://www.redhat.com/en/blog/container-security-seccomp), Inspektor Gadget, ARMO | Trace a container's syscalls, emit a seccomp profile | Container-scoped; no CVE reachability, no counterfactual |
| [Hacksaw, ASPLOS 2023](https://dl.acm.org/doi/10.1145/3576915.3623208), KASR, FACE-CHANGE, COZART | Kernel debloating from hardware inventory or dynamic traces | Requires a kernel rebuild; not a live host-assessment tool |
| [Microsoft AttackSurfaceAnalyzer](https://github.com/microsoft/AttackSurfaceAnalyzer) | Snapshot-diffs userspace surface: services, ports, files, accounts | Not kernel-aware |

## The gap

Every entry above is either **per-application** or **whole-kernel aggregate**.
Neither models the situation on an actual host: dozens of concurrent workloads
sharing one kernel, where attack surface is a **jointly held liability** and the
interesting question is not "what is exposed" but "who is responsible, what does
it cost, and what is the cheapest way out".

## Contributions

1. **Host-wide attribution.** A bipartite blame graph from workloads to surface
   elements to CVE clusters, with sole-ownership detection and marginal
   contribution per workload. Nothing in the table above attributes shared kernel
   surface across concurrently running workloads.

2. **Orphaned surface.** The intersection of *present*, *unprivileged-reachable*,
   and *used by nothing*. Prior debloating work computes unused code for a single
   application; we compute it host-wide across all live workloads simultaneously,
   which is what makes the result actionable with provably zero functional impact.

3. **Counterfactual planning.** Hardening posed as weighted set cover over CVE
   clusters, with breakage cost as the denominator, producing a short ordered plan
   instead of an unranked findings list. Each step ships an artifact, a breakage
   prediction, a detection command, and a revert command.

4. **Autoload-aware reachability.** An unloaded module is still reachable if it
   can be autoloaded by an unprivileged `socket()` or `ioctl()`. Treating
   "not loaded" as "not present" understates real exposure; we model it explicitly.

## Honest limitations

- Risk weights are a **documented heuristic**, not ground truth. Each carries a
  justification in `data/weights.yaml`.
- Dynamic tracing over a finite window cannot prove a syscall is never used. This
  is the same completeness limitation identified in the debloating literature; it
  is why generated artifacts are proposed for review rather than auto-applied, and
  why every step ships a revert command.
- CVE-to-subsystem mapping is coarse-grained at the cluster level, not per-function
  reachability.
