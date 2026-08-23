/**
 * TypeScript mirror of report.schema.json (the ksl report contract).
 * Optional fields here are optional in the schema and must be treated as
 * possibly-absent at every render site ("not collected", never broken).
 */

export interface KslSkipped {
  source?: string;
  reason?: string;
}

export interface KslMeta {
  kernel_release: string;
  arch: string;
  distro: string;
  collected_at: string;
  trace_seconds: number;
  trace_backend?: string;
  ran_as_root?: boolean;
  skipped?: KslSkipped[];
  ksl_version: string;
}

export type KslElementKind =
  | "capability"
  | "devnode"
  | "kconfig"
  | "lsm"
  | "module"
  | "namespace"
  | "syscall"
  | "sysctl"
  | (string & {});

export interface KslSurfaceElement {
  id: string;
  kind: KslElementKind;
  name: string;
  subsystem?: string;
  weight: number;
  present: boolean;
  reachable_unpriv: boolean;
  used: boolean;
  gate_reason?: string;
  cve_clusters: string[];
  mitigations?: string[];
}

export interface KslWorkload {
  id: string;
  comm: string;
  unit?: string;
  pids: number[];
  uid?: number;
  caps_effective?: string[];
  seccomp_mode?: number;
  touches: string[];
}

export interface KslLedgerRow {
  workload_id: string;
  surface_debt: number;
  marginal_contribution?: number;
  sole_owner_elements: string[];
  shared_elements: string[];
  reachable_cves: number;
  explanation?: string;
}

export interface KslOrphaned {
  elements: string[];
  total_weight: number;
  cves_neutralizable: number;
}

export type KslBreakageRisk = "none" | "low" | "medium" | "high" | (string & {});

export interface KslPlanStep {
  step: number;
  action: string;
  targets: string[];
  cves_killed: number;
  weight_removed?: number;
  breakage_risk: KslBreakageRisk;
  breakage_note?: string;
  detection?: string;
  requires_reboot?: boolean;
  artifact: { path?: string; content?: string };
  revert: string;
}

export interface KslScore {
  total_surface_weight: number;
  reachable_surface_weight: number;
  reachable_cve_count: number;
  orphan_ratio: number;
  projected_after_plan?: {
    reachable_surface_weight?: number;
    reachable_cve_count?: number;
  };
}

export interface KslReport {
  meta: KslMeta;
  surface_elements: KslSurfaceElement[];
  workloads: KslWorkload[];
  ledger: KslLedgerRow[];
  orphaned: KslOrphaned;
  plan: KslPlanStep[];
  score: KslScore;
}
