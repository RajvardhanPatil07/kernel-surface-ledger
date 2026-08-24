/**
 * Layout contract for the impact graph, plus a self-check that proves the
 * rendered graph obeys it. The graph is the one place in the dashboard where a
 * bad layout silently misleads (crossed lines read as wrong dependencies), so
 * the rules are asserted in-app instead of trusted.
 */

export interface GraphNode {
  id: string;
  column: 0 | 1 | 2;
  row: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphGeometry {
  colX: number[];
  nodeW: number;
  nodeH: number;
  row: number;
}

/**
 * Elbow router: leave the source, run down/up a trunk lane owned by the source
 * node, then enter the target horizontally. Only H / V / Q (corner arcs)
 * commands — never a diagonal bezier.
 */
export function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tx: number,
  radius: number,
): string {
  if (Math.abs(y2 - y1) < 1) return `M${x1},${y1} H${x2}`;
  const s = Math.sign(y2 - y1);
  const r = Math.min(radius, Math.abs(y2 - y1) / 2, Math.abs(tx - x1), Math.abs(x2 - tx));
  return `M${x1},${y1} H${tx - r} Q${tx},${y1} ${tx},${y1 + s * r} V${y2 - s * r} Q${tx},${y2} ${tx + r},${y2} H${x2}`;
}

export interface LayoutCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

function crossings(
  edges: GraphEdge[],
  rowOf: Map<string, number>,
  colOf: Map<string, number>,
  layer: number,
): number {
  const es = edges.filter((e) => colOf.get(e.from) === layer);
  let n = 0;
  for (let i = 0; i < es.length; i += 1) {
    for (let j = i + 1; j < es.length; j += 1) {
      const a = es[i]!;
      const b = es[j]!;
      const a1 = rowOf.get(a.from) ?? 0;
      const a2 = rowOf.get(a.to) ?? 0;
      const b1 = rowOf.get(b.from) ?? 0;
      const b2 = rowOf.get(b.to) ?? 0;
      if ((a1 - b1) * (a2 - b2) < 0) n += 1;
    }
  }
  return n;
}

/**
 * Validates the four layout rules the graph promises: orthogonal elbows,
 * barycenter row ordering, one trunk lane per branching node, and a junction
 * dot on every edge arrival.
 */
export function auditImpactLayout(args: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: Map<string, number>;
  paths: string[];
  dots: number;
  geometry: GraphGeometry;
  insertionRow: Map<string, number>;
}): { checks: LayoutCheck[]; pass: boolean } {
  const { nodes, edges, lanes, paths, dots, geometry, insertionRow } = args;
  const rowOf = new Map(nodes.map((n) => [n.id, n.row]));
  const colOf = new Map(nodes.map((n) => [n.id, n.column as number]));
  const checks: LayoutCheck[] = [];

  // 1. Orthogonal elbows only.
  const diagonal = paths.filter((d) => /[CcSsTtAaLl]/.test(d));
  const shapeOk = paths.every((d) => /^M[\d.,-]+ (H|V)/.test(d));
  checks.push({
    id: "elbows",
    label: "orthogonal elbows",
    pass: diagonal.length === 0 && shapeOk && paths.length === edges.length,
    detail:
      diagonal.length === 0 && shapeOk
        ? `${paths.length} of ${edges.length} edges routed with H/V segments and arc corners only`
        : `${diagonal.length} edge(s) contain a diagonal curve command`,
  });

  // 2. Barycenter ordering beats insertion order on crossings.
  const before =
    crossings(edges, insertionRow, colOf, 0) + crossings(edges, insertionRow, colOf, 1);
  const after = crossings(edges, rowOf, colOf, 0) + crossings(edges, rowOf, colOf, 1);
  checks.push({
    id: "barycenter",
    label: "barycenter ordering",
    pass: after <= before,
    detail: `edge crossings ${before} → ${after} after reordering rows by parent/child average`,
  });

  // 3. Trunk lanes: one per branching node, distinct, inside the gutter.
  const branching = nodes.filter((n) => edges.filter((e) => e.from === n.id).length > 1);
  const missing = branching.filter((n) => !lanes.has(n.id));
  const laneValues = [...lanes.entries()];
  const outOfGutter = laneValues.filter(([id, x]) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return true;
    const left = geometry.colX[node.column]! + geometry.nodeW / 2;
    const right = geometry.colX[node.column + 1]! - geometry.nodeW / 2;
    return x <= left || x >= right;
  });
  const perColumnDupes = [0, 1].reduce((acc, column) => {
    const xs = laneValues
      .filter(([id]) => nodes.find((n) => n.id === id)?.column === column)
      .map(([, x]) => Math.round(x * 10));
    return acc + (xs.length - new Set(xs).size);
  }, 0);
  checks.push({
    id: "lanes",
    label: "trunk lanes per branch",
    pass: missing.length === 0 && outOfGutter.length === 0 && perColumnDupes === 0,
    detail:
      missing.length === 0 && outOfGutter.length === 0 && perColumnDupes === 0
        ? `${branching.length} branching node(s) each own a distinct lane inside the gutter`
        : `${missing.length} missing, ${outOfGutter.length} outside the gutter, ${perColumnDupes} shared`,
  });

  // 4. One junction dot per edge arrival.
  checks.push({
    id: "dots",
    label: "junction dots",
    pass: dots === edges.length,
    detail: `${dots} dots for ${edges.length} edges`,
  });

  // 5. No two nodes share a slot in a column.
  const slotDupes = [0, 1, 2].reduce((acc, column) => {
    const rows = nodes.filter((n) => n.column === column).map((n) => n.row);
    return acc + (rows.length - new Set(rows).size);
  }, 0);
  checks.push({
    id: "slots",
    label: "no overlapping nodes",
    pass: slotDupes === 0,
    detail:
      slotDupes === 0
        ? `${nodes.length} nodes occupy unique rows in their column`
        : `${slotDupes} node(s) share a row`,
  });

  // 6. Every edge connects adjacent columns left to right.
  const badDirection = edges.filter((e) => (colOf.get(e.to) ?? 0) - (colOf.get(e.from) ?? 0) !== 1);
  checks.push({
    id: "direction",
    label: "left-to-right flow",
    pass: badDirection.length === 0,
    detail:
      badDirection.length === 0
        ? "every edge advances exactly one column"
        : `${badDirection.length} edge(s) skip or reverse a column`,
  });

  return { checks, pass: checks.every((c) => c.pass) };
}
