/** Regression check for model narration against deterministic report values. */
import type { KslReport } from './ksl-types'

export interface Claim {
  kind: 'cves' | 'weight' | 'id'
  claimed: string
  ok: boolean
  note: string
}
export interface ClaimReport { verdict: 'verified' | 'diverged' | 'no-claims'; claims: Claim[] }

const near = (a: number, b: number) => Math.abs(a - b) < 0.051

function allowedCves(report: KslReport) {
  const values = new Set<number>([report.score.reachable_cve_count, report.orphaned.cves_neutralizable])
  if (typeof report.score.projected_after_plan?.reachable_cve_count === 'number') values.add(report.score.projected_after_plan.reachable_cve_count)
  let acc = 0
  for (const s of [...report.plan].sort((a, b) => a.step - b.step)) {
    values.add(s.cves_killed)
    acc += s.cves_killed
    values.add(acc)
  }
  for (const row of report.ledger) values.add(row.reachable_cves)
  return [...values]
}

function allowedWeights(report: KslReport) {
  const values = new Set<number>([report.score.total_surface_weight, report.score.reachable_surface_weight, report.orphaned.total_weight])
  if (typeof report.score.projected_after_plan?.reachable_surface_weight === 'number') values.add(report.score.projected_after_plan.reachable_surface_weight)
  for (const s of report.plan) if (s.weight_removed !== undefined) values.add(s.weight_removed)
  for (const el of report.surface_elements) values.add(el.weight)
  for (const row of report.ledger) {
    values.add(row.surface_debt)
    if (row.marginal_contribution !== undefined) values.add(row.marginal_contribution)
  }
  return [...values]
}

export function checkClaims(report: KslReport, text: string): ClaimReport {
  const claims: Claim[] = []
  const cves = allowedCves(report)
  const weights = allowedWeights(report)
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:reachable\s+)?CVEs?\b/gi)) {
    const n = Number(m[1])
    const ok = cves.some((v) => near(v, n))
    claims.push({ kind: 'cves', claimed: `${m[1]} CVEs`, ok, note: ok ? 'matches a CVE value in the report' : 'does not match a CVE value in the report' })
  }
  for (const m of text.matchAll(/weight[^\d\n]{0,20}(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*weight/gi)) {
    const raw = m[1] ?? m[2]
    if (raw === undefined) continue
    const n = Number(raw)
    const ok = weights.some((v) => near(v, n))
    claims.push({ kind: 'weight', claimed: `weight ${raw}`, ok, note: ok ? 'matches a report weight' : 'does not match a report weight' })
  }
  const known = new Set([...report.surface_elements.map((e) => e.id), ...report.workloads.map((w) => w.id)])
  const seen = new Set<string>()
  for (const m of text.matchAll(/\b((?:mod|sc|sysctl|cap|dev|kcfg|lsm|ns|w)\.[a-z0-9_.-]+)/gi)) {
    const id = (m[1] ?? '').replace(/[.,;:)]+$/, '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    claims.push({ kind: 'id', claimed: id, ok: known.has(id), note: known.has(id) ? 'exists in the report' : 'id is not in the report' })
  }
  if (claims.length === 0) return { verdict: 'no-claims', claims }
  return { verdict: claims.every((c) => c.ok) ? 'verified' : 'diverged', claims }
}
