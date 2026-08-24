import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateReport } from "@/lib/ksl-report";
import { summarize } from "@/lib/ksl-summary";
import type { KslReport } from "@/lib/ksl-types";

export interface ScanRow {
  id: string;
  host_label: string;
  kernel_release: string;
  arch: string;
  distro: string;
  trace_backend: string | null;
  collected_at: string;
  total_surface_weight: number;
  reachable_surface_weight: number;
  reachable_cve_count: number;
  orphan_ratio: number;
  created_at: string;
}

const LIST_COLUMNS =
  "id, host_label, kernel_release, arch, distro, trace_backend, collected_at, total_surface_weight, reachable_surface_weight, reachable_cve_count, orphan_ratio, created_at";

export const listScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scans")
      .select(LIST_COLUMNS)
      .order("collected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ScanRow[];
  });

export const getScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("A scan id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("scans")
      .select(`${LIST_COLUMNS}, report`)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That scan does not exist, or is not yours");

    const result = validateReport(row.report);
    if (!result.ok) throw new Error(`Stored report is not schema-valid: ${result.reason}`);

    const { report: _drop, ...meta } = row as unknown as ScanRow & { report: unknown };
    return { scan: meta as ScanRow, report: result.report as KslReport };
  });

export const saveScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { hostLabel?: string; report: unknown }) => {
    if (!input || typeof input !== "object") throw new Error("A report is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const result = validateReport(data.report);
    if (!result.ok) throw new Error(`Not a valid ksl report: ${result.reason}`);

    const summary = summarize(result.report, data.hostLabel);
    const { data: row, error } = await context.supabase
      .from("scans")
      .insert({ ...summary, report: result.report as never, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("A scan id is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
