import { Fragment, useMemo, useState } from 'react'
import type { Report } from '../lib/report'
import { formatWeight } from '../lib/motion'
import { Chip, SectionHeading } from './primitives'

type SortKey = 'workload_id' | 'surface_debt' | 'marginal_contribution' | 'reachable_cves'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'workload_id', label: 'workload', numeric: false },
  { key: 'surface_debt', label: 'surface debt', numeric: true },
  { key: 'marginal_contribution', label: 'marginal', numeric: true },
  { key: 'reachable_cves', label: 'cves', numeric: true },
]

function DebtBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="tnum w-14 text-right font-bold text-ink">{formatWeight(value)}</span>
      <span
        aria-hidden="true"
        style={{ width: `${pct}%` }}
        className={`h-1.5 min-w-1 rounded-sm ${value === 0 ? 'bg-rule' : 'bg-amber/80'}`}
      />
    </div>
  )
}

function ExpandedRow({
  report,
  row,
}: {
  report: Report
  row: Report['ledger'][number]
}) {
  const byId = useMemo(
    () => new Map(report.surface_elements.map((e) => [e.id, e])),
    [report],
  )
  const chipFor = (id: string) => {
    const element = byId.get(id)
    return (
      <Chip key={id} title={element ? `${element.kind} · w${element.weight} · ${element.gate_reason ?? ''}` : id}>
        {element?.name ?? id}
      </Chip>
    )
  }
  const workload = report.workloads.find((w) => w.id === row.workload_id)

  return (
    <tr className="border-b border-rule-soft bg-panel">
      <td colSpan={5} className="px-4 py-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-ink-faint">sole owner of</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.sole_owner_elements.length > 0
                ? row.sole_owner_elements.map(chipFor)
                : <span className="text-xs text-ink-faint">nothing exclusively</span>}
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.08em] text-ink-faint">shares</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.shared_elements.length > 0
                ? row.shared_elements.map(chipFor)
                : <span className="text-xs text-ink-faint">nothing shared</span>}
            </div>
            {workload ? (
              <p className="mt-4 text-xs text-ink-faint">
                {workload.unit ?? workload.comm} · pids {workload.pids.slice(0, 4).join(', ')}
                {workload.pids.length > 4 ? ` +${workload.pids.length - 4}` : ''} · seccomp{' '}
                {workload.seccomp_mode === 2 ? 'filter' : workload.seccomp_mode === 1 ? 'strict' : 'off'}
              </p>
            ) : null}
          </div>
          <div className="whitespace-pre-line border-l border-rule pl-6 text-sm leading-relaxed text-ink-dim">
            {row.explanation || 'explanation pending — deterministic run contains no narration.'}
          </div>
        </div>
      </td>
    </tr>
  )
}

export function OrphanedRow({ report, maxDebt }: { report: Report; maxDebt: number }) {
  const [open, setOpen] = useState(false)
  const byId = useMemo(
    () => new Map(report.surface_elements.map((e) => [e.id, e])),
    [report],
  )

  return (
    <>
      <tr className="border-b border-amber/40 bg-amber/[0.06]">
        <td className="px-4 py-4">
          <span className="font-bold text-amber">ORPHANED</span>
          <span className="ml-3 text-xs text-amber-deep sm:inline">
            touched by nothing — free to remove
          </span>
        </td>
        <td className="px-4 py-4">
          <DebtBar value={report.orphaned.total_weight} max={maxDebt} />
        </td>
        <td className="px-4 py-4 text-right text-ink-faint">—</td>
        <td className="tnum px-4 py-4 text-right font-bold text-amber">
          {report.orphaned.cves_neutralizable}
        </td>
        <td className="px-4 py-4 text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="orphaned-detail"
            className="rounded-sm border border-amber/60 px-2 py-1 text-xs uppercase tracking-[0.08em] text-amber transition-colors duration-150 hover:bg-amber hover:text-ground"
          >
            {open ? 'hide' : `show ${report.orphaned.elements.length}`}
          </button>
        </td>
      </tr>
      {open ? (
        <tr id="orphaned-detail" className="border-b border-rule-soft bg-panel">
          <td colSpan={5} className="px-4 py-5">
            <div className="flex flex-wrap gap-1.5">
              {report.orphaned.elements.map((id) => {
                const element = byId.get(id)
                return (
                  <Chip key={id} title={element ? `${element.kind} · w${element.weight} · ${element.gate_reason ?? ''}` : id}>
                    {element?.name ?? id}
                  </Chip>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              every entry is present, reachable by an unprivileged local user, and was used by no
              workload during the observation window.
            </p>
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function LedgerTable({ report }: { report: Report }) {
  const [sortKey, setSortKey] = useState<SortKey>('surface_debt')
  const [dir, setDir] = useState<1 | -1>(-1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const rows = [...report.ledger]
    rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
    return rows
  }, [report.ledger, sortKey, dir])

  const maxDebt = useMemo(
    () => Math.max(...report.ledger.map((r) => r.surface_debt), 0),
    [report.ledger],
  )

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setDir(key === 'workload_id' ? 1 : -1)
    }
  }

  const ariaSortFor = (key: SortKey): 'ascending' | 'descending' | undefined =>
    key === sortKey ? (dir === 1 ? 'ascending' : 'descending') : undefined

  return (
    <section aria-labelledby="ledger-heading" className="scroll-mt-8" id="ledger">
      <SectionHeading note="debt = weight you own outright + your share of shared surface">
        <span id="ledger-heading">Surface debt ledger</span>
      </SectionHeading>

      <div className="overflow-x-auto border border-rule">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase tracking-[0.08em] text-ink-faint">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSortFor(col.key)}
                  className={`px-4 py-3 font-normal ${col.key !== 'workload_id' ? 'text-right' : ''}`}
                >
                  <div className={col.key !== 'workload_id' ? 'flex justify-end' : ''}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`transition-colors duration-150 hover:text-ink ${
                        sortKey === col.key ? 'font-bold text-amber' : ''
                      }`}
                    >
                      {col.label}
                      <span aria-hidden="true" className="pl-1">
                        {sortKey === col.key ? (dir === -1 ? '↓' : '↑') : ''}
                      </span>
                    </button>
                  </div>
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-right font-normal">detail</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isOpen = expanded === row.workload_id
              return (
                <Fragment key={row.workload_id}>
                  <tr
                    className={`border-b border-rule-soft transition-colors duration-150 ${
                      isOpen ? 'bg-panel' : 'hover:bg-panel'
                    }`}
                  >
                    <td className="px-4 py-3.5 font-bold text-ink">{row.workload_id.replace(/^w\./, '')}</td>
                    <td className="px-4 py-3.5">
                      <DebtBar value={row.surface_debt} max={maxDebt} />
                    </td>
                    <td className="tnum px-4 py-3.5 text-right text-ink-dim">
                      {formatWeight(row.marginal_contribution ?? 0)}
                    </td>
                    <td className="tnum px-4 py-3.5 text-right text-ink">{row.reachable_cves}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`${row.workload_id}-detail`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpanded(isOpen ? null : row.workload_id)
                        }}
                        className={`cursor-pointer rounded-sm border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] transition-colors duration-150 ${
                          isOpen
                            ? 'border-amber bg-amber text-ground font-bold'
                            : 'border-rule text-ink-faint hover:border-amber hover:text-amber'
                        }`}
                      >
                        {isOpen ? 'close' : 'open'}
                      </button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr id={`${row.workload_id}-detail`} aria-hidden="false">
                      <td colSpan={5} className="p-0">
                        <ExpandedRow report={report} row={row} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
            <OrphanedRow report={report} maxDebt={maxDebt} />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-right text-[11px] text-ink-faint lg:hidden">scroll sideways for all columns ⟶</p>
    </section>
  )
}
