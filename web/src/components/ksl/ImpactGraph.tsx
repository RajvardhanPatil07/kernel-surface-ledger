import { useMemo, useState } from "react";
import { auditImpactLayout, edgePath } from "@/lib/impact-graph-audit";
import { fmt, resolveTarget } from "@/lib/ksl-report";
import type { KslReport } from "@/lib/ksl-types";

/**
 * Interactive impact graph: hardening step -> the kernel surface it removes ->
 * the kernel capability and the user-space workloads that surface serves.
 *
 * Layout rules that keep branching readable:
 *  - column 2 nodes are ordered by the average row of their parents
 *    (barycenter), which removes most edge crossings;
 *  - every edge is routed as an elbow through a trunk lane owned by its source
 *    node, so all branches leaving one node visibly share a spine and then
 *    fan out at distinct heights instead of forming a diagonal hairball;
 *  - hovering or clicking any node lights the whole path through it.
 */

interface Node {
  id: string;
  label: string;
  sub: string;
  column: 0 | 1 | 2;
  row: number;
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
}

const COL_X = [116, 436, 756];
const ROW = 42;
const TOP = 44;
const WIDTH = 880;
const NODE_W = 196;
const NODE_H = 30;
const RADIUS = 7;

export function ImpactGraph({ report }: { report: KslReport }) {
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const { nodes, edges, insertionRow, height } = useMemo(() => {
    const draft: Omit<Node, "x" | "y">[] = [];
    const edges: Edge[] = [];
    const rows: [number, number, number] = [0, 0, 0];

    const push = (id: string, label: string, sub: string, column: 0 | 1 | 2) => {
      if (draft.some((n) => n.id === id)) return;
      draft.push({ id, label, sub, column, row: rows[column] });
      rows[column] += 1;
    };

    const steps = [...report.plan].sort((a, b) => a.step - b.step);

    for (const s of steps) {
      const stepId = `step.${s.step}`;
      push(
        stepId,
        `step ${s.step} · ${s.action}`,
        `${s.cves_killed} CVEs · risk ${s.breakage_risk}`,
        0,
      );

      for (const target of s.targets) {
        const el = resolveTarget(report, target);
        const elId = el ? `el.${el.id}` : `el.${target}`;
        push(
          elId,
          el ? el.id : target,
          el
            ? `${el.kind}${el.subsystem ? ` · ${el.subsystem}` : ""} · weight ${fmt(el.weight)}`
            : `${target} · not itemized in this report`,
          1,
        );
        edges.push({ from: stepId, to: elId });

        const capLabel = el ? (el.subsystem ?? el.kind) : "unmapped subsystem";
        const capId = `cap.${capLabel}`;
        push(capId, `kernel: ${capLabel}`, "kernel capability", 2);
        edges.push({ from: elId, to: capId });

        const users = report.workloads.filter(
          (w) => w.touches.includes(target) || (el ? w.touches.includes(el.id) : false),
        );
        for (const w of users) {
          const wId = `w.${w.id}`;
          push(wId, `${w.comm}${w.unit ? ` (${w.unit})` : ""}`, "user-space workload", 2);
          edges.push({ from: elId, to: wId });
        }
        if (users.length === 0) {
          const noneId = "impact.none";
          push(noneId, "no observed user", "orphaned — nothing broke", 2);
          edges.push({ from: elId, to: noneId });
        }
      }
    }

    // Barycenter pass: reorder the right column by the mean row of its parents,
    // then the middle column by the mean row of its children, so lines run
    // mostly flat instead of crossing.
    const insertionRow = new Map(draft.map((n) => [n.id, n.row]));
    const rowOf = new Map(draft.map((n) => [n.id, n.row]));
    const reorder = (column: 1 | 2, parents: boolean) => {
      const group = draft.filter((n) => n.column === column);
      const score = (id: string) => {
        const rel = edges
          .filter((e) => (parents ? e.to === id : e.from === id))
          .map((e) => rowOf.get(parents ? e.from : e.to) ?? 0);
        return rel.length ? rel.reduce((a, b) => a + b, 0) / rel.length : Number.MAX_SAFE_INTEGER;
      };
      group
        .map((n) => ({ n, k: score(n.id) }))
        .sort((a, b) => a.k - b.k || a.n.row - b.n.row)
        .forEach(({ n }, i) => {
          n.row = i;
          rowOf.set(n.id, i);
        });
    };
    reorder(2, true);
    reorder(1, false);
    reorder(2, true);

    const nodes: Node[] = draft.map((n) => ({
      ...n,
      x: COL_X[n.column]!,
      y: TOP + n.row * ROW,
    }));

    const maxRow = Math.max(...rows);
    return { nodes, edges, insertionRow, height: TOP + maxRow * ROW + 28 };
  }, [report]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Trunk lane per source node: branches from the same node share one vertical
  // spine, which is what makes the fan-out legible.
  const laneX = useMemo(() => {
    const lanes = new Map<string, number>();
    for (const column of [0, 1] as const) {
      const sources = nodes
        .filter((n) => n.column === column && edges.some((e) => e.from === n.id))
        .sort((a, b) => a.row - b.row);
      const start = COL_X[column]! + NODE_W / 2;
      const end = COL_X[column + 1]! - NODE_W / 2;
      const usable = end - start - 26;
      const stride = sources.length > 1 ? Math.min(16, usable / (sources.length - 1)) : 0;
      sources.forEach((n, i) => lanes.set(n.id, start + 20 + i * stride));
    }
    return lanes;
  }, [nodes, edges]);

  // Precomputed edge paths: rendered as-is and handed to the layout audit, so
  // the diagnostic below grades exactly what the reader is looking at.
  const edgePaths = useMemo(
    () =>
      edges.map((e) => {
        const a = nodes.find((n) => n.id === e.from);
        const b = nodes.find((n) => n.id === e.to);
        if (!a || !b) return "";
        return edgePath(
          a.x + NODE_W / 2,
          a.y + NODE_H / 2,
          b.x - NODE_W / 2,
          b.y + NODE_H / 2,
          laneX.get(a.id) ?? (a.x + b.x) / 2,
          RADIUS,
        );
      }),
    [edges, nodes, laneX],
  );

  const audit = useMemo(
    () =>
      auditImpactLayout({
        nodes,
        edges,
        lanes: laneX,
        paths: edgePaths.filter(Boolean),
        dots: edgePaths.filter(Boolean).length,
        geometry: { colX: COL_X, nodeW: NODE_W, nodeH: NODE_H, row: ROW },
        insertionRow,
      }),
    [nodes, edges, laneX, edgePaths, insertionRow],
  );

  const focus = hover ?? active;
  // Only the directed path through the focused node lights up: its ancestors
  // upstream and its descendants downstream, never a sibling's subtree.
  const { keep, litEdges } = useMemo(() => {
    if (!focus) return { keep: null as Set<string> | null, litEdges: null as Set<string> | null };
    const grow = (dir: "down" | "up") => {
      const set = new Set<string>([focus]);
      for (let i = 0; i < 4; i += 1) {
        for (const e of edges) {
          if (dir === "down" && set.has(e.from)) set.add(e.to);
          if (dir === "up" && set.has(e.to)) set.add(e.from);
        }
      }
      return set;
    };
    const down = grow("down");
    const up = grow("up");
    const lit = new Set<string>();
    edges.forEach((e, i) => {
      const inDown = down.has(e.from) && down.has(e.to);
      const inUp = up.has(e.from) && up.has(e.to);
      if (inDown || inUp) lit.add(`${e.from}>${e.to}>${i}`);
    });
    return { keep: new Set([...down, ...up]), litEdges: lit };
  }, [focus, edges]);
  const connected = keep;

  if (report.plan.length === 0) {
    return (
      <p className="border border-border bg-surface p-4 text-sm text-muted-foreground">
        No plan steps in this report, so there is nothing to trace.
      </p>
    );
  }

  const dim = (id: string) => (connected ? !connected.has(id) : false);

  return (
    <div className="border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          hardening step → kernel surface removed → kernel capability and user-space functions that
          depend on it
        </span>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="border border-border px-2 py-0.5 transition-colors hover:border-amber-dim hover:text-amber"
        >
          {active ? "clear selection" : "hover or click any node to isolate its paths"}
        </button>
      </div>

      <div className="overflow-x-auto p-3">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label="Impact graph from hardening steps to affected kernel capabilities and workloads"
          className="min-w-[760px]"
          onMouseLeave={() => setHover(null)}
        >
          {["hardening step", "surface removed", "what depends on it"].map((label, i) => (
            <text
              key={label}
              x={COL_X[i]! - NODE_W / 2}
              y={22}
              className="fill-muted-foreground"
              fontSize="9"
              letterSpacing="1.4"
            >
              {label.toUpperCase()}
            </text>
          ))}

          {edges.map((e, i) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W / 2;
            const x2 = b.x - NODE_W / 2;
            const y1 = a.y + NODE_H / 2;
            const y2 = b.y + NODE_H / 2;
            const d =
              edgePaths[i] ?? edgePath(x1, y1, x2, y2, laneX.get(a.id) ?? (x1 + x2) / 2, RADIUS);
            const lit = litEdges ? litEdges.has(`${e.from}>${e.to}>${i}`) : false;
            return (
              <path
                key={`${e.from}-${e.to}-${i}`}
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth={lit ? 2 : 1.1}
                strokeLinecap="round"
                className={
                  lit
                    ? "text-amber"
                    : connected
                      ? "text-border opacity-25"
                      : "text-border opacity-70"
                }
              />
            );
          })}

          {/* Junction dots make each branch point unmistakable. */}
          {edges.map((e, i) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            const lit = litEdges ? litEdges.has(`${e.from}>${e.to}>${i}`) : false;
            return (
              <circle
                key={`dot-${e.from}-${e.to}-${i}`}
                cx={b.x - NODE_W / 2}
                cy={b.y + NODE_H / 2}
                r={lit ? 2.6 : 1.8}
                className={
                  lit ? "fill-amber" : connected ? "fill-border opacity-25" : "fill-border"
                }
              />
            );
          })}

          {nodes.map((n) => {
            const faded = dim(n.id);
            const selected = active === n.id || hover === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x - NODE_W / 2},${n.y})`}
                onClick={() => setActive((cur) => (cur === n.id ? null : n.id))}
                onMouseEnter={() => setHover(n.id)}
                className="cursor-pointer transition-opacity"
                opacity={faded ? 0.22 : 1}
              >
                <title>{`${n.label} — ${n.sub}`}</title>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  className={
                    selected
                      ? "fill-surface-raised stroke-amber"
                      : "fill-surface-raised stroke-border hover:stroke-amber-dim"
                  }
                  strokeWidth={selected ? 1.6 : 1}
                />
                <text
                  x={8}
                  y={13}
                  fontSize="9.5"
                  className={selected ? "fill-amber" : "fill-foreground"}
                >
                  {n.label.length > 30 ? `${n.label.slice(0, 29)}…` : n.label}
                </text>
                <text x={8} y={23.5} fontSize="7.5" className="fill-muted-foreground">
                  {n.sub.length > 40 ? `${n.sub.slice(0, 39)}…` : n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={() => setShowAudit((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <span
              className={`px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                audit.pass
                  ? "border border-amber-dim text-amber"
                  : "border border-destructive text-destructive"
              }`}
            >
              {audit.pass ? "layout ok" : "layout check failed"}
            </span>
            <span>
              {audit.checks.filter((c) => c.pass).length}/{audit.checks.length} layout rules
              verified on this render
            </span>
          </span>
          <span>{showAudit ? "hide detail" : "show detail"}</span>
        </button>

        {showAudit ? (
          <ul className="mt-2 space-y-1">
            {audit.checks.map((c) => (
              <li key={c.id} className="flex gap-2 text-[11px] leading-relaxed">
                <span className={c.pass ? "text-amber" : "text-destructive"}>
                  {c.pass ? "PASS" : "FAIL"}
                </span>
                <span className="text-foreground">{c.label}</span>
                <span className="text-muted-foreground">— {c.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Edges come straight from the report: a step&apos;s{" "}
        <span className="text-foreground">targets</span>, each target&apos;s{" "}
        <span className="text-foreground">subsystem</span>, and the workloads whose{" "}
        <span className="text-foreground">touches</span> include it. A target reaching only
        &ldquo;no observed user&rdquo; is orphaned surface — removing it broke nothing during the
        observation window.
      </p>
    </div>
  );
}
