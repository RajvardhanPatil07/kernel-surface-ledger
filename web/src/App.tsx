import { useCallback, useEffect, useState } from 'react'
import bundled from './data/demo-report.json'
import { AskPanel } from '@/components/ksl/AskPanel'
import { GatesTable } from '@/components/ksl/GatesTable'
import { HeaderBand } from '@/components/ksl/HeaderBand'
import { ImpactGraph } from '@/components/ksl/ImpactGraph'
import type { LoadFailure } from '@/components/ksl/LoadErrorPanel'
import { LedgerTable } from '@/components/ksl/LedgerTable'
import { OrphanedGrid } from '@/components/ksl/OrphanedGrid'
import { PlanSteps } from '@/components/ksl/PlanSteps'
import { Provenance } from '@/components/ksl/Provenance'
import { Section } from '@/components/ksl/primitives'
import { groundingContext } from '@/lib/ksl-summary'
import { validateReport } from '@/lib/ksl-report'
import type { KslReport } from '@/lib/ksl-types'

const TITLE = 'Kernel Surface Ledger — who owns your kernel attack surface'
const BUNDLED = bundled as unknown as KslReport
const MAX_BYTES = 25 * 1024 * 1024

export default function App() {
  const [report, setReport] = useState<KslReport>(BUNDLED)
  const [sourceLabel, setSourceLabel] = useState('bundled demo scan')
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    document.title = TITLE
    const description = 'ksl attributes Linux kernel attack surface to live workloads, finds unused reachable surface, and ranks hardening steps.'
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)
  }, [])

  const loadFile = useCallback(async (file: File) => {
    const fail = (kind: LoadFailure['kind'], detail: string) => setFailure({ kind, fileName: file.name || 'dropped file', detail })
    setFailure(null)
    const looksJson = file.type === 'application/json' || /\.json$/i.test(file.name) || file.type === ''
    if (!looksJson) return fail('not-json-file', `type "${file.type}" is not JSON`)
    if (file.size === 0) return fail('empty', '0 bytes on disk')
    if (file.size > MAX_BYTES) return fail('too-large', `${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 25 MB limit`)
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text()) as unknown
    } catch (err) {
      return fail('bad-json', err instanceof Error ? err.message : 'JSON.parse failed')
    }
    const result = validateReport(parsed)
    if (!result.ok) return fail('bad-schema', result.reason)
    setReport(result.report)
    setSourceLabel(file.name)
  }, [])

  return (
    <main
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void loadFile(file)
        else setFailure({ kind: 'not-json-file', fileName: 'dropped item', detail: 'no file was in the drop' })
      }}
      className="min-h-screen bg-background"
    >
      {dragging ? <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80"><p className="border border-amber px-6 py-4 text-sm text-amber">drop a report.json to render it</p></div> : null}
      <HeaderBand report={report} sourceLabel={sourceLabel} onLoadFile={(f) => void loadFile(f)} failure={failure} onDismissFailure={() => setFailure(null)} />
      <Section id="ask" label="00 / interrogate" title="Ask this report" lede="The narration layer answers from the loaded JSON, cites element and workload ids, and refuses to guess where the data does not reach."><AskPanel context={groundingContext(report)} report={report} /></Section>
      <Section id="ledger" label="01 / attribution" title="Surface Debt Ledger" lede="Dangerous kernel surface is a jointly held liability across every live workload on the host. Each row is one workload's share."><LedgerTable report={report} /></Section>
      <Section id="orphaned" label="02 / free hardening" title="Orphaned surface" lede="Present, reachable by any unprivileged local user, and used by nothing during the observation window. Removing it is provably zero-impact — nothing touches it."><OrphanedGrid report={report} /></Section>
      <Section id="gates" label="03 / reachability, not mere presence" title="Three-tier gates" lede="Every element passes present → reachable_unpriv → used, making reachability explicit rather than treating mere presence as exposure."><GatesTable report={report} /></Section>
      <Section id="plan" label="04 / counterfactual" title="Hardening plan" lede="Hardening as weighted set cover: changes that neutralize maximum reachable CVE mass per unit of estimated breakage."><PlanSteps report={report} /></Section>
      <Section id="impact" label="05 / blast radius" title="Impact graph" lede="See what each hardening step touches: the exact kernel surface it removes and the workloads depending on that surface."><ImpactGraph report={report} /></Section>
      <Section id="provenance" label="06 / provenance" title="Where the AI is — and is not" lede="The scoring engine is deterministic. The model explains and generates; it never decides."><Provenance report={report} /></Section>
      <footer className="border-t border-border py-8"><div className="mx-auto max-w-[1400px] px-4 text-[11px] text-muted-foreground sm:px-6">Kernel Surface Ledger — reports render from the frozen report contract; drag any schema-valid report.json onto this page.</div></footer>
    </main>
  )
}
