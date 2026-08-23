import { formatWeight, useCountUp } from '../lib/motion'
import type { Report } from '../lib/report'

function MetaLine({ report }: { report: Report }) {
  const { meta } = report
  const backend =
    meta.trace_backend === 'none'
      ? 'untraced'
      : `${meta.trace_backend} · ${meta.trace_seconds}s`
  return (
    <p className="text-xs text-ink-faint">
      {meta.distro} · {meta.kernel_release} · {meta.arch} · {backend}
      {meta.ran_as_root ? '' : ' · unprivileged run'}
    </p>
  )
}

function UntracedNotice() {
  return (
    <p className="mt-4 border border-dashed border-rule px-3 py-2 text-xs text-amber-deep">
      no syscall tracer ran during collection — syscall usage is unknown, and the
      orphaned set deliberately excludes syscalls rather than guessing.
    </p>
  )
}

function FallingArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 96 40"
      className="h-8 w-20 sm:h-10 sm:w-24"
      fill="none"
      stroke="var(--color-amber)"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path pathLength={1} className="arrow-draw" d="M4 20 H74" />
      <path pathLength={1} className="arrow-draw" style={{ animationDelay: '1250ms' }} d="M62 8 L76 20 L62 32" />
    </svg>
  )
}

export function ReportHero({
  report,
  sourceLabel,
}: {
  report: Report
  sourceLabel: string
}) {
  const { score } = report
  const current = useCountUp(score.reachable_cve_count)
  const projected = score.projected_after_plan?.reachable_cve_count
  const hasProjection =
    projected !== undefined && projected < score.reachable_cve_count
  const steps = report.plan.length
  const killed = Math.max(score.reachable_cve_count - (projected ?? score.reachable_cve_count), 0)

  return (
    <header className="border-b border-rule pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-sm font-bold uppercase tracking-[0.14em] text-ink">
          Kernel Surface Ledger
        </h1>
        <p className="text-xs text-ink-faint">
          ksl {report.meta.ksl_version} · source: {sourceLabel}
        </p>
      </div>
      <div className="mt-1 border-b border-rule-soft pb-4">
        <MetaLine report={report} />
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="tnum text-hero font-extrabold leading-none text-amber">
            {Math.round(current)}
          </span>
          {hasProjection ? <FallingArrow /> : null}
          {hasProjection ? (
            <span className="tnum rise-in text-hero font-extrabold leading-none text-ink">
              {projected}
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink sm:text-lg">
          CVEs reachable by any local user on this host today
          {hasProjection ? (
            <span className="text-ink-dim">
              {' '}— falls to{' '}
              <span className="tnum font-bold text-ink">{projected}</span> once the{' '}
              <span className="font-bold text-ink">{steps}-step plan</span> below is applied (
              {killed} killed).
            </span>
          ) : (
            '.'
          )}
        </p>

        <p className="mt-6 max-w-3xl border-b-2 border-amber pb-1 text-sm leading-relaxed text-ink sm:text-base">
          <span className="tnum font-bold text-amber">{formatWeight(report.orphaned.total_weight)}</span>{' '}
          weighted units of surface are present and reachable yet touched by{' '}
          <span className="font-bold">nothing</span> on this host. Removing them
          cannot break any workload observed.
        </p>

        {report.meta.trace_backend === 'none' ? <UntracedNotice /> : null}
      </div>
    </header>
  )
}
