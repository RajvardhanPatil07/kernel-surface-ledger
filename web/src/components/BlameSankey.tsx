import { useMemo, useState } from 'react'
import type { Report } from '../lib/report'
import { SectionHeading } from './primitives'

interface SankeyNode {
  id: string
  label: string
  value: number
  y: number
  height: number
}

interface SankeyLink {
  sourceY: number
  targetY: number
  width: number
  workloadId: string
}

interface SankeyLayout {
  columns: { x: number; nodes: SankeyNode[] }[]
  linksWL: SankeyLink[]
  linksEC: SankeyLink[]
  height: number
}

const WIDTH = 1080
const NODE_WIDTH = 14
const GAP = 10
const TOP_PAD = 8

function buildLayout(report: Report): SankeyLayout {
  const byId = new Map(report.surface_elements.map((e) => [e.id, e]))

  const touchers = new Map<string, string[]>()
  for (const workload of [...report.workloads].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const eid of workload.touches) {
      touchers.set(eid, [...(touchers.get(eid) ?? []), workload.id])
    }
  }

  const heldElements = [...touchers.keys()].sort((a, b) => {
    const wa = byId.get(a)?.weight ?? 0
    const wb = byId.get(b)?.weight ?? 0
    return wb - wa || a.localeCompare(b)
  })

  const workloadsSorted = [...report.workloads].sort((a, b) => {
    const sum = (w: typeof a) =>
      w.touches.reduce((acc, eid) => acc + (byId.get(eid)?.weight ?? 0) / (touchers.get(eid)?.length ?? 1), 0)
    return sum(b) - sum(a) || a.id.localeCompare(b.id)
  })

  const clusterWeight = new Map<string, number>()
  for (const eid of heldElements) {
    const element = byId.get(eid)
    if (!element) continue
    for (const cluster of element.cve_clusters) {
      clusterWeight.set(cluster, (clusterWeight.get(cluster) ?? 0) + element.weight / element.cve_clusters.length)
    }
  }
  const clustersSorted = [...clusterWeight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)

  const columnValues: [number[], number[], number[]] = [
    workloadsSorted.map((w) =>
      w.touches.reduce(
        (acc, eid) => acc + (byId.get(eid)?.weight ?? 0) / (touchers.get(eid)?.length ?? 1),
        0,
      ),
    ),
    heldElements.map((eid) => byId.get(eid)?.weight ?? 0),
    clustersSorted.map((id) => clusterWeight.get(id) ?? 0),
  ]

  const tallest = Math.max(...columnValues.map((col) => col.reduce((a, b) => a + b, 0)))
  const scale = Math.min((420 - TOP_PAD - GAP * Math.max(...columnValues.map((c) => c.length - 1))) / tallest, 30)

  const layoutColumns = columnValues.map((col, columnIndex) => {
    let cursor = TOP_PAD
    const nodes = col.map((value, index) => {
      const height = value * scale
      const node = { id: '', label: '', value, y: cursor, height }
      cursor += height + GAP
      void index
      return node
    })
    return { nodes, columnIndex }
  })

  const wlNodes: SankeyNode[] = layoutColumns[0].nodes.map((node, i) => ({
    ...node,
    id: workloadsSorted[i].id,
    label: workloadsSorted[i].id.replace(/^w\./, ''),
  }))
  const elNodes: SankeyNode[] = layoutColumns[1].nodes.map((node, i) => ({
    ...node,
    id: heldElements[i],
    label: byId.get(heldElements[i])?.name ?? heldElements[i],
  }))
  const clNodes: SankeyNode[] = layoutColumns[2].nodes.map((node, i) => ({
    ...node,
    id: clustersSorted[i],
    label: clustersSorted[i],
  }))

  const offsetSource = new Map<string, number>()
  const offsetTarget = new Map<string, number>()
  const linksWL: SankeyLink[] = []
  for (let wi = 0; wi < wlNodes.length; wi++) {
    const workload = workloadsSorted[wi]
    for (const eid of [...workload.touches].sort()) {
      const element = byId.get(eid)
      if (!element) continue
      const share = element.weight / (touchers.get(eid)?.length ?? 1)
      const elIndex = heldElements.indexOf(eid)
      if (elIndex < 0) continue
      const sourceNode = wlNodes[wi]
      const targetNode = elNodes[elIndex]
      const sY = sourceNode.y + (offsetSource.get(sourceNode.id) ?? 0) + share * scale / 2
      const tY = targetNode.y + (offsetTarget.get(targetNode.id) ?? 0) + share * scale / 2
      offsetSource.set(sourceNode.id, (offsetSource.get(sourceNode.id) ?? 0) + share * scale)
      offsetTarget.set(targetNode.id, (offsetTarget.get(targetNode.id) ?? 0) + share * scale)
      linksWL.push({ sourceY: sY, targetY: tY, width: Math.max(share * scale, 1), workloadId: workload.id })
    }
  }

  const offsetElOut = new Map<string, number>()
  const offsetClIn = new Map<string, number>()
  const linksEC: SankeyLink[] = []
  for (const eid of heldElements) {
    const element = byId.get(eid)
    if (!element) continue
    const elIndex = heldElements.indexOf(eid)
    const perCluster = element.weight / Math.max(element.cve_clusters.length, 1)
    for (const cluster of [...element.cve_clusters].sort()) {
      const clIndex = clustersSorted.indexOf(cluster)
      if (clIndex < 0) continue
      const sY = elNodes[elIndex].y + (offsetElOut.get(eid) ?? 0) + perCluster * scale / 2
      const tY = clNodes[clIndex].y + (offsetClIn.get(cluster) ?? 0) + perCluster * scale / 2
      offsetElOut.set(eid, (offsetElOut.get(eid) ?? 0) + perCluster * scale)
      offsetClIn.set(cluster, (offsetClIn.get(cluster) ?? 0) + perCluster * scale)
      linksEC.push({
        sourceY: sY,
        targetY: tY,
        width: Math.max(perCluster * scale, 1),
        workloadId: firstToucher(touchers, eid),
      })
    }
  }

  const height = Math.max(
    ...[wlNodes, elNodes, clNodes].map((nodes) =>
      nodes.length ? nodes[nodes.length - 1].y + nodes[nodes.length - 1].height : 0,
    ),
  ) + TOP_PAD

  const xs = [70, WIDTH / 2 + 60, WIDTH - 250]
  return {
    columns: [
      { x: xs[0], nodes: wlNodes },
      { x: xs[1], nodes: elNodes },
      { x: xs[2], nodes: clNodes },
    ],
    linksWL,
    linksEC,
    height: Math.max(height, 200),
  }
}

function firstToucher(touchers: Map<string, string[]>, eid: string): string {
  return touchers.get(eid)?.[0] ?? ''
}

function ribbon(x0: number, x1: number, y0: number, y1: number, w: number): string {
  const midX = (x0 + x1) / 2
  const half = w / 2
  return [
    `M ${x0} ${y0 - half}`,
    `C ${midX} ${y0 - half} ${midX} ${y1 - half} ${x1} ${y1 - half}`,
    `L ${x1} ${y1 + half}`,
    `C ${midX} ${y1 + half} ${midX} ${y0 + half} ${x0} ${y0 + half}`,
    'Z',
  ].join(' ')
}

export function BlameSankey({ report }: { report: Report }) {
  const [active, setActive] = useState<string | null>(null)
  const layout = useMemo(() => buildLayout(report), [report])
  const [wlCol, elCol, clCol] = layout.columns

  const dimFor = (linkWorkloadId: string): number =>
    active === null || active === linkWorkloadId ? 0.5 : 0.06

  return (
    <section aria-labelledby="sankey-heading" className="scroll-mt-8" id="blame-graph">
      <SectionHeading note="hover or click a workload to isolate its paths · ribbon width = weighted surface">
        <span id="sankey-heading">Blame graph</span>
      </SectionHeading>

      <div className="overflow-x-auto border border-rule bg-panel">
        <svg
          viewBox={`0 0 ${WIDTH} ${layout.height}`}
          role="img"
          aria-label="Sankey diagram attributing kernel surface from workloads through elements to CVE clusters"
          className="h-auto w-full min-w-[720px]"
        >
          {layout.linksWL.map((link, i) => (
            <path
              key={`wl-${i}`}
              d={ribbon(wlCol.x + NODE_WIDTH, elCol.x, link.sourceY, link.targetY, link.width)}
              fill="var(--color-amber)"
              opacity={dimFor(link.workloadId)}
              style={{ transition: 'opacity 150ms' }}
            />
          ))}
          {layout.linksEC.map((link, i) => (
            <path
              key={`ec-${i}`}
              d={ribbon(elCol.x + NODE_WIDTH, clCol.x, link.sourceY, link.targetY, link.width)}
              fill="var(--color-ink-dim)"
              opacity={active === null ? 0.28 : active === link.workloadId ? 0.45 : 0.05}
              style={{ transition: 'opacity 150ms' }}
            />
          ))}

          {[wlCol, elCol, clCol].map((col, ci) =>
            col.nodes.map((node) => (
              <rect
                key={`${ci}-${node.id}`}
                x={col.x}
                y={node.y}
                width={NODE_WIDTH}
                height={Math.max(node.height, 1)}
                fill={ci === 0 ? 'var(--color-amber)' : ci === 1 ? '#c9c9c9' : 'var(--color-ink-faint)'}
              />
            )),
          )}

          {wlCol.nodes.map((node) => (
            <text
              key={`t-${node.id}`}
              x={wlCol.x + NODE_WIDTH + 8}
              y={node.y + node.height / 2 + 4}
              fontSize="13"
              fontWeight={700}
              fill={active === node.id ? 'var(--color-amber)' : 'var(--color-ink)'}
              stroke="var(--color-ground)"
              strokeWidth={4}
              paintOrder="stroke"
              tabIndex={0}
              role="button"
              aria-pressed={active === node.id}
              aria-label={`isolate paths for workload ${node.label}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActive((v) => (v === node.id ? null : node.id))
                }
              }}
              onFocus={() => setActive(node.id)}
              onBlur={() => setActive(null)}
              className="sankey-label cursor-pointer select-none"
              onMouseEnter={() => setActive(node.id)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive((v) => (v === node.id ? null : node.id))}
            >
              {node.label}
            </text>
          ))}
          {elCol.nodes.map((node) => (
            <text
              key={`t-${node.id}`}
              x={elCol.x - 8}
              y={node.y + node.height / 2 + 4}
              fontSize="11"
              fill="#c9c9c9"
              textAnchor="end"
              stroke="var(--color-ground)"
              strokeWidth={3.5}
              paintOrder="stroke"
              className="select-none"
            >
              {node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}
            </text>
          ))}
          {clCol.nodes.map((node) => (
            <text
              key={`t-${node.id}`}
              x={clCol.x + NODE_WIDTH + 8}
              y={node.y + node.height / 2 + 4}
              fontSize="11"
              fill="var(--color-ink-dim)"
              stroke="var(--color-ground)"
              strokeWidth={3.5}
              paintOrder="stroke"
              className="select-none"
            >
              {node.label}
            </text>
          ))}
        </svg>
      </div>
      <p className="mt-2 text-right text-[11px] text-ink-faint lg:hidden">scroll sideways for the full graph ⟶</p>
    </section>
  )
}
