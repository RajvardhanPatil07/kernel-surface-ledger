import { X } from 'lucide-react'
import { Chip } from './primitives'
import { cn } from '@/lib/utils'
import { diffReports, elementNameOf } from '@/lib/diff'
import type { KslReport } from '@/lib/ksl-types'

function DeltaValue({ before, after, lowerIsBetter, digits = 0 }: {
  before: number
  after: number
  lowerIsBetter: boolean
  digits?: number
}) {
  const delta = Math.round((after - before) * 1000) / 1000
  const improved = lowerIsBetter ? delta < 0 : delta > 0
  const regressed = lowerIsBetter ? delta > 0 : delta < 0
  const fmt = (n: number) => n.toFixed(digits).replace(/\.0+$/, digits > 0 ? '' : '')
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-2">
      <span className="tnum text-sm text-muted-foreground">{fmt(before)}</span>
      <span aria-hidden className="text-muted-foreground">→</span>
      <span className="tnum text-2xl font-bold text-foreground">{fmt(after)}</span>
      {delta !== 0 ? (
        <span
          className={cn(
            'tnum text-xs',
            improved && 'text-ok',
            regressed && 'text-destructive',
            !improved && !regressed && 'text-muted-foreground',
          )}
        >
          {delta > 0 ? '+' : ''}
          {fmt(delta)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">unchanged</span>
      )}
    </p>
  )
}

export function DiffSection({ base, next, onClose }: {
  base: KslReport
  next: KslReport
  onClose: () => void
}) {
  const diff = diffReports(base, next)

  return (
    <div className="border-y border-amber-dim/60 bg-surface">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-dim">
              00 / regression watch
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">
              What changed between the two scans you loaded
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {diff.hostBefore} <span aria-hidden>→</span> {diff.hostAfter}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1 border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber"
          >
            <X className="size-3" aria-hidden />
            close comparison
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {diff.deltas.map((d) => (
            <div key={d.label} className="border border-border bg-surface-raised p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {d.label}
              </p>
              <DeltaValue
                before={d.before}
                after={d.after}
                lowerIsBetter={d.lowerIsBetter}
                digits={d.digits ?? 0}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              orphaned transitions
            </p>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-orphan">newly free to remove:</span>
                {diff.newlyOrphaned.length === 0 ? (
                  <span className="text-xs text-muted-foreground">none</span>
                ) : (
                  diff.newlyOrphaned.map((id) => (
                    <Chip key={id} tone="orphan" title={id}>
                      {elementNameOf(next, id)}
                    </Chip>
                  ))
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">no longer orphaned:</span>
                {diff.noLongerOrphaned.length === 0 ? (
                  <span className="text-xs text-muted-foreground">none</span>
                ) : (
                  diff.noLongerOrphaned.map((id) => (
                    <Chip key={id} title={id}>
                      {elementNameOf(base, id)}
                    </Chip>
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              surface debt movers
            </p>
            {diff.debtChanges.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                no workload changed its debt between these scans
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {diff.debtChanges.slice(0, 6).map((c) => (
                  <li key={c.workloadId} className="flex items-baseline gap-2">
                    <span className="text-foreground">{c.comm}</span>
                    <span className="tnum text-muted-foreground">
                      {c.before.toFixed(2)} → {c.after.toFixed(2)}
                    </span>
                    <span
                      className={cn(
                        'tnum',
                        c.delta < 0 ? 'text-ok' : 'text-destructive',
                      )}
                    >
                      {c.delta > 0 ? '+' : ''}
                      {c.delta.toFixed(2)}
                    </span>
                  </li>
                ))}
                {diff.debtChanges.length > 6 ? (
                  <li className="text-muted-foreground">
                    +{diff.debtChanges.length - 6} more
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
