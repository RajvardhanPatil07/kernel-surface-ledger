import { useCallback, useEffect, useState } from 'react'
import bundled from './data/demo-report.json'
import { validateReport } from '@/lib/ksl-report'
import type { KslReport } from '@/lib/ksl-types'
import { GatesTable } from '@/components/ksl/GatesTable'
import { HeaderBand } from '@/components/ksl/HeaderBand'
import type { LoadFailure } from '@/components/ksl/LoadErrorPanel'
import { LedgerTable } from '@/components/ksl/LedgerTable'
import { OrphanedGrid } from '@/components/ksl/OrphanedGrid'
import { PlanSteps } from '@/components/ksl/PlanSteps'
import { Provenance } from '@/components/ksl/Provenance'
import { Section } from '@/components/ksl/primitives'

// The bundled demo report renders with zero network calls.
const BUNDLED = bundled as unknown as KslReport

const MAX_BYTES = 25 * 1024 * 1024

export default function App() {
  const [report, setReport] = useState<KslReport>(BUNDLED)
  const [sourceLabel, setSourceLabel] = useState('bundled demo scan')
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [dragging, setDragging] = useState(false)

  // Same-origin fetch of the latest runner-produced scan; on a plain clone
  // (no /latest/) this degrades silently to the bundled demo fixture.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}latest/report.json`, {
          headers: { accept: 'application/json' },
        })
        if (!response.ok) return
        const parsed: unknown = await response.json()
        const result = validateReport(parsed)
        if (!result.ok || cancelled) return
        setReport(result.report)
        setSourceLabel(`latest runner scan · ${result.report.meta.collected_at.slice(0, 10)}`)
      } catch {
        // no bundled runner scan — the demo fixture stays up
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadFile = useCallback(async (file: File) => {
    const fail = (kind: LoadFailure['kind'], detail: string) =>
      setFailure({ kind, fileName: file.name || 'dropped file', detail })

    setFailure(null)

    const looksJson =
      file.type === 'application/json' || /\.json$/i.test(file.name) || file.type === ''
    if (!looksJson) {
      fail('not-json-file', `type "${file.type}" is not JSON`)
      return
    }
    if (file.size === 0) {
      fail('empty', '0 bytes on disk')
      return
    }
    if (file.size > MAX_BYTES) {
      fail('too-large', `${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 25 MB limit`)
      return
    }

    let text: string
    try {
      text = await file.text()
    } catch (err) {
      fail('bad-json', err instanceof Error ? err.message : 'the file could not be read')
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch (err) {
      fail('bad-json', err instanceof Error ? err.message : 'JSON.parse failed')
      return
    }

    const result = validateReport(parsed)
    if (!result.ok) {
      fail('bad-schema', result.reason)
      return
    }

    setReport(result.report)
    setSourceLabel(file.name)
  }, [])

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) {
          void loadFile(file)
        } else {
          setFailure({
            kind: 'not-json-file',
            fileName: 'dropped item',
            detail: 'no file was in the drop — folders and browser tabs cannot be read',
          })
        }
      }}
      className="min-h-screen bg-background"
    >
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <p className="border border-amber px-6 py-4 text-sm text-amber">
            drop a report.json to render it
          </p>
        </div>
      ) : null}

      <HeaderBand
        report={report}
        sourceLabel={sourceLabel}
        onLoadFile={(f) => void loadFile(f)}
        failure={failure}
        onDismissFailure={() => setFailure(null)}
      />

      <Section
        id="ledger"
        label="01 / attribution"
        title="Surface Debt Ledger"
        lede={
          <>
            Dangerous kernel surface is a jointly held liability across every live workload on the
            host. Each row is one workload&apos;s share: its debt, its marginal contribution, the
            surface it alone keeps open, and the CVE mass that surface exposes. Expand a row for the
            causal narration. The last row is the point.
          </>
        }
      >
        <LedgerTable report={report} />
      </Section>

      <Section
        id="orphaned"
        label="02 / free hardening"
        title="Orphaned surface"
        lede="Present, reachable by any unprivileged local user, and used by nothing during the observation window. Removing it is provably zero-impact — nothing touches it."
      >
        <OrphanedGrid report={report} />
      </Section>

      <Section
        id="gates"
        label="03 / reachability, not mere presence"
        title="Three-tier gates"
        lede="A CVE in a module that cannot be loaded is irrelevant; one reachable by any local user is critical. Every element passes present → reachable_unpriv → used, and module autoload turns 'not loaded' into one socket() call away."
      >
        <GatesTable report={report} />
      </Section>

      <Section
        id="plan"
        label="04 / counterfactual"
        title="Hardening plan"
        lede="Hardening as weighted set cover: the changes that neutralize maximum reachable CVE mass per unit of estimated breakage. Not an unranked findings list — an ordered plan, each step shipping an artifact, a breakage prediction, a detection command and a revert."
      >
        <PlanSteps report={report} />
      </Section>

      <Section
        id="provenance"
        label="05 / provenance"
        title="Where the AI is — and is not"
        lede="The scoring engine is fully deterministic. The model explains and generates; it never decides."
      >
        <Provenance report={report} />
      </Section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-[1400px] px-4 text-[11px] text-muted-foreground sm:px-6">
          Kernel Surface Ledger (ksl) — kernel attack surface as an accountability problem. Reports
          are rendered from the frozen report.schema.json contract; drag any schema-valid
          report.json onto this page.
        </div>
      </footer>
    </main>
  )
}
