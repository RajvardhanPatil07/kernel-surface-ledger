import { useMemo, useState } from 'react'
import type { KslReport } from '@/lib/ksl-types'
import { fmt } from '@/lib/ksl-report'

type Node = { id: string; label: string; sub: string; column: 0 | 1 | 2; row: number }
type Edge = { from: string; to: string }

const COL_X = [116, 436, 756] as const
const ROW = 42
const TOP = 44
const WIDTH = 880
const NODE_W = 196
const NODE_H = 30

export function ImpactGraph({ report }: { report: KslReport }) {
  const [active, setActive] = useState<string | null>(null)
  const graph = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const rows = [0, 0, 0]
    const push = (id: string, label: string, sub: string, column: 0 | 1 | 2) => {
      if (nodes.some((n) => n.id === id)) return
      nodes.push({ id, label, sub, column, row: rows[column]! })
      rows[column] = rows[column]! + 1
    }

    for (const step of [...report.plan].sort((a, b) => a.step - b.step)) {
      const stepId = `step.${step.step}`
      push(stepId, `step ${step.step} · ${step.action}`, `${step.cves_killed} CVEs · risk ${step.breakage_risk}`, 0)
      for (const target of step.targets) {
        const element = report.surface_elements.find((e) => e.id === target)
        const elementId = `el.${target}`
        push(elementId, target, element ? `${element.kind} · weight ${fmt(element.weight)}` : 'not itemized in report', 1)
        edges.push({ from: stepId, to: elementId })
        const users = report.workloads.filter((w) => w.touches.includes(target))
        if (users.length === 0) {
          push('impact.none', 'no observed user', 'orphaned — nothing observed', 2)
          edges.push({ from: elementId, to: 'impact.none' })
        } else {
          for (const workload of users) {
            const workloadId = `w.${workload.id}`
            push(workloadId, `${workload.comm}${workload.unit ? ` (${workload.unit})` : ''}`, 'user-space workload', 2)
            edges.push({ from: elementId, to: workloadId })
          }
        }
      }
    }
    const height = TOP + Math.max(...rows) * ROW + 28
    return { nodes, edges, height }
  }, [report])

  if (report.plan.length === 0) {
    return <p className="border border-border bg-surface p-4 text-sm text-muted-foreground">No plan steps in this report, so there is nothing to trace.</p>
  }

  const connected = new Set<string>()
  if (active) {
    for (let i = 0; i < 4; i += 1) {
      connected.add(active)
      for (const edge of graph.edges) {
        if (connected.has(edge.from)) connected.add(edge.to)
        if (connected.has(edge.to)) connected.add(edge.from)
      }
    }
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  return (
    <div className="border border-border bg-surface">
      <div className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">hardening step → surface removed → workloads that depend on it</div>
      <div className="overflow-x-auto p-3">
        <svg viewBox={`0 0 ${WIDTH} ${graph.height}`} width="100%" height={graph.height} className="min-w-[760px]" role="img" aria-label="Impact graph">
          {["hardening step", "surface removed", "what depends on it"].map((label, i) => <text key={label} x={COL_X[i] - NODE_W / 2} y={22} className="fill-muted-foreground" fontSize="9" letterSpacing="1.4">{label.toUpperCase()}</text>)}
          {graph.edges.map((edge, index) => {
            const a = byId.get(edge.from)
            const b = byId.get(edge.to)
            if (!a || !b) return null
            const x1 = COL_X[a.column] + NODE_W / 2
            const x2 = COL_X[b.column] - NODE_W / 2
            const y1 = TOP + a.row * ROW + NODE_H / 2
            const y2 = TOP + b.row * ROW + NODE_H / 2
            const lit = !active || (connected.has(edge.from) && connected.has(edge.to))
            return <path key={`${edge.from}-${edge.to}-${index}`} d={`M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`} fill="none" stroke="currentColor" strokeWidth={lit ? 1.6 : 1} className={lit ? 'text-amber' : 'text-border opacity-25'} />
          })}
          {graph.nodes.map((node) => {
            const selected = active === node.id
            const faded = active !== null && !connected.has(node.id)
            return (
              <g key={node.id} transform={`translate(${COL_X[node.column] - NODE_W / 2},${TOP + node.row * ROW})`} onClick={() => setActive((current) => current === node.id ? null : node.id)} className="cursor-pointer" opacity={faded ? 0.22 : 1}>
                <rect width={NODE_W} height={NODE_H} className={selected ? 'fill-surface-raised stroke-amber' : 'fill-surface-raised stroke-border'} />
                <text x={8} y={13} fontSize="9.5" className={selected ? 'fill-amber' : 'fill-foreground'}>{node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label}</text>
                <text x={8} y={23.5} fontSize="7.5" className="fill-muted-foreground">{node.sub.length > 40 ? `${node.sub.slice(0, 39)}…` : node.sub}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
