import { useEffect, useRef, useState } from 'react'
import {
  BUNDLED_REPORT,
  parseDroppedFile,
  tryFetchLatest,
  type Report,
} from './lib/report'
import { ReportHero } from './components/ReportHero'
import { LedgerTable } from './components/LedgerTable'
import { BlameSankey } from './components/BlameSankey'
import { PlanSection } from './components/PlanSection'

type Source = { label: string; report: Report }

function DropZone({ onReport }: { onReport: (report: Report, name: string) => void }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ingest = async (file: File) => {
    try {
      const report = await parseDroppedFile(file)
      setError(null)
      onReport(report, file.name)
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'could not read that file'
      setError(`${reason} — export a ksl report.json and try again`)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void ingest(file)
      }}
      className={`flex flex-wrap items-center justify-between gap-3 border border-dashed px-4 py-3 text-xs transition-colors duration-150 ${
        dragging ? 'border-amber bg-amber/[0.06]' : 'border-rule'
      }`}
    >
      <p className={error ? 'text-danger' : 'text-ink-faint'}>
        {error ?? 'drop any ksl report.json here — or'}
      </p>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-sm border border-rule px-2.5 py-1 text-ink-dim transition-colors duration-150 hover:border-amber hover:text-amber"
        >
          choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void ingest(file)
            e.target.value = ''
          }}
        />
      </span>
    </div>
  )
}

export default function App() {
  const [source, setSource] = useState<Source>({
    label: 'bundled demo scan',
    report: BUNDLED_REPORT,
  })

  useEffect(() => {
    let cancelled = false
    void tryFetchLatest().then((latest) => {
      if (!cancelled && latest) {
        setSource({ label: `latest runner scan · ${latest.meta.collected_at.slice(0, 10)}`, report: latest })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8">
      <ReportHero report={source.report} sourceLabel={source.label} />

      <div className="mt-6">
        <DropZone
          onReport={(report, name) => setSource({ label: `dropped: ${name}`, report })}
        />
      </div>

      <main className="mt-14 space-y-20">
        <LedgerTable report={source.report} />
        <BlameSankey report={source.report} />
        <PlanSection report={source.report} />
      </main>

      <footer className="mt-24 border-t border-rule pt-6 text-xs leading-relaxed text-ink-faint">
        <p>
          deterministic engine output — identical reports render identically; the LLM layer only
          narrates and can never move a number.
        </p>
        <p className="mt-1">
          collected {source.report.meta.collected_at} by ksl {source.report.meta.ksl_version} ·{' '}
          {source.report.meta.skipped?.length ?? 0} sources skipped and recorded · artifacts are
          generated for review, never applied.
        </p>
      </footer>
    </div>
  )
}
