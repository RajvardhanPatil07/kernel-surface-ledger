/**
 * End-to-end test suite for the docs/TESTING.md checklist.
 *
 *   bun run test:e2e            # against http://localhost:8080
 *   BASE_URL=... bun run test:e2e
 *
 * Prints a pass/fail line per check and exits non-zero if anything failed.
 */

import demoReport from "../src/data/demo-report.json";
import { validateReport, cumulativePlan } from "../src/lib/ksl-report";
import { stepChecks } from "../src/lib/ksl-checks";
import { checkClaims } from "../src/lib/claim-check";
import { extractAnswer } from "../src/lib/answer-filter";
import type { KslReport } from "../src/lib/ksl-types";

const BASE = process.env["BASE_URL"] ?? "http://localhost:8080";

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];

async function check(name: string, fn: () => Promise<string> | string) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const report = demoReport as unknown as KslReport;

// ---- 1. report contract ------------------------------------------------------
await check("bundled demo scan is schema-valid", () => {
  const result = validateReport(report);
  assert(result.ok, result.ok ? "" : `invalid: ${result.reason}`);
  return `${report.surface_elements.length} elements, ${report.plan.length} plan steps`;
});

await check("orphaned elements are reachable and unused", () => {
  const byId = new Map(report.surface_elements.map((e) => [e.id, e]));
  for (const id of report.orphaned.elements) {
    const el = byId.get(id);
    assert(el, `orphaned id ${id} is not in surface_elements`);
    assert(
      el!.present && el!.reachable_unpriv && !el!.used,
      `${id} is not present+reachable+unused`,
    );
  }
  return `${report.orphaned.elements.length} orphaned elements verified`;
});

await check("plan CVE mass matches the projected score", () => {
  const total = cumulativePlan(report).at(-1)?.cumulative ?? 0;
  const projected = report.score.projected_after_plan?.reachable_cve_count;
  assert(total > 0, "plan kills zero CVEs");
  if (typeof projected === "number") {
    assert(
      projected <= report.score.reachable_cve_count,
      "projection is higher than the current reachable CVE count",
    );
  }
  return `${total} CVEs killed across ${report.plan.length} steps`;
});

await check("every plan step ships a revert and a check", () => {
  for (const s of report.plan) {
    assert(s.revert && s.revert.trim().length > 0, `step ${s.step} has no revert`);
    assert(stepChecks(report, s).length > 0, `step ${s.step} produced no check commands`);
  }
  return `${report.plan.length} steps have reverts + copyable checks`;
});

// ---- 2. narration hygiene ----------------------------------------------------
await check("scratchpad and echoed instructions are stripped", () => {
  const leaked = [
    "then ANSWER: one sentence direct answer. Then WHY: 2-4 short lines.",
    "We must keep under 220 words. Provide concise answer.",
    "Let's craft:",
    "<think>deliberating</think>",
    "===ANSWER===",
    "ANSWER: Blacklist the six autoloadable modules.",
    "WHY: mod.bluetooth weight 6.",
  ].join("\n");
  const clean = extractAnswer(leaked);
  assert(
    clean.startsWith("ANSWER: Blacklist"),
    `answer did not start at ANSWER: -> ${clean.slice(0, 60)}`,
  );
  assert(!/let'?s craft|must keep under/i.test(clean), "planning text survived the filter");
  return "filter keeps only the reader-facing answer";
});

await check("claim regression: report figures verify, invented ones fail", () => {
  const step = [...report.plan].sort((a, b) => b.cves_killed - a.cves_killed)[0]!;
  const truthful = `ANSWER: step ${step.step} wins.\nWHY: it kills ${step.cves_killed} CVEs and removes weight ${step.weight_removed ?? report.orphaned.total_weight}, see ${step.targets[0] ?? report.orphaned.elements[0]}.`;
  const good = checkClaims(report, truthful);
  assert(
    good.verdict === "verified",
    `truthful answer flagged: ${JSON.stringify(good.claims.filter((c) => !c.ok))}`,
  );

  const invented = "ANSWER: blacklisting kills 999 CVEs and removes weight 4242 from mod.notreal.";
  const bad = checkClaims(report, invented);
  assert(bad.verdict === "diverged", "invented figures were not caught");
  return `${good.claims.length} claims verified, invented figures rejected`;
});

// ---- 3. live app -------------------------------------------------------------
const ROUTES = ["/", "/how-it-works", "/pipeline", "/prior-art", "/submission"];
for (const route of ROUTES) {
  await check(`GET ${route} renders`, async () => {
    const res = await fetch(`${BASE}${route}`);
    assert(res.ok, `status ${res.status}`);
    const html = await res.text();
    assert(html.includes("<html"), "response is not HTML");
    return `${res.status}, ${(html.length / 1024).toFixed(0)} KB`;
  });
}

await check("AI ask endpoint accepts direct requests without a bearer token", async () => {
  const res = await fetch(`${BASE}/api/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "hi", context: "too short" }),
  });
  assert(res.status === 400, `expected public validation response 400, got ${res.status}`);
  return "400 validation response without a bearer token";
});

// ---- summary ----------------------------------------------------------------
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;

console.log("\nksl end-to-end suite");
console.log("=".repeat(72));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`);
}
console.log("=".repeat(72));
console.log(`${pass}/${results.length} checks passed${fail ? `, ${fail} FAILED` : " — all green"}`);
process.exit(fail ? 1 : 0);
