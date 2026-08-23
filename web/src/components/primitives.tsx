import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export function Badge({
  tone,
  children,
}: {
  tone: 'none' | 'low' | 'medium' | 'high' | 'amber' | 'dim'
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    none: 'border-safe/60 text-safe',
    low: 'border-amber/70 text-amber',
    medium: 'border-amber text-amber bg-amber/10',
    high: 'border-danger text-danger',
    amber: 'border-amber bg-amber text-ground font-bold',
    dim: 'border-rule text-ink-faint',
  }
  return (
    <span
      className={`inline-block rounded-sm border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <code
      title={title}
      className="inline-block rounded-sm border border-rule bg-panel px-1.5 py-0.5 text-xs text-ink-dim"
    >
      {children}
    </code>
  )
}

export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setCopied(true)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }, [text])

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-live="polite"
      className={`rounded-sm border px-2 py-1 text-xs transition-colors duration-150 ${
        copied
          ? 'border-safe text-safe'
          : 'border-rule text-ink-dim hover:border-amber hover:text-amber'
      }`}
    >
      {copied ? 'copied' : label}
    </button>
  )
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-sm text-ink">{title}</p>
      <p className="max-w-md text-xs text-ink-faint">{hint}</p>
    </div>
  )
}

export function SectionHeading({
  children,
  note,
}: {
  children: ReactNode
  note?: string
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 className="text-lg font-bold tracking-tight text-ink">{children}</h2>
      {note ? <p className="text-xs text-ink-faint">{note}</p> : null}
    </div>
  )
}
