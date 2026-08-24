import { useEffect, useRef, useState } from 'react'
import { checkClaims } from '@/lib/claim-check'
import type { KslReport } from '@/lib/ksl-types'
import { requireSupabase } from '@/lib/supabase'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

function ClaimAudit({ report, text }: { report: KslReport; text: string }) {
  const audit = checkClaims(report, text)
  if (audit.verdict === 'no-claims') return null
  const bad = audit.claims.filter((c) => !c.ok)
  return (
    <div className="mt-2">
      <p className={`text-[10px] uppercase tracking-[0.16em] ${audit.verdict === 'verified' ? 'text-amber' : 'text-destructive'}`}>
        {audit.verdict === 'verified' ? `✓ ${audit.claims.length} claims checked against the report — all match` : `✕ ${bad.length} of ${audit.claims.length} claims do not match the report`}
      </p>
      {bad.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {bad.map((c) => (
            <li key={`${c.kind}-${c.claimed}`} className="text-[11px] text-destructive">“{c.claimed}” — {c.note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const SUGGESTIONS = [
  'Which single change removes the most reachable CVE mass, and what could it break?',
  'What is reachable here that nothing is using, and why is removing it safe?',
  'Which workload is the most expensive to keep, and what would I lose without it?',
  'What can this report NOT tell me about this host?',
]

export function AskPanel({ context, report }: { context: string; report: KslReport }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      void requireSupabase().auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))).catch(() => setSignedIn(false))
    } catch {
      setSignedIn(false)
    }
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [turns])

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setError(null)
    setQuestion('')
    const history = turns
    setTurns([...history, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }])
    setBusy(true)
    try {
      const { data } = await requireSupabase().auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your session expired — sign in again')
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: trimmed, context, history }),
      })
      if (!response.ok) throw new Error((await response.text()) || `the model endpoint returned ${response.status}`)
      const text = await response.text()
      setTurns((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: text }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the model call failed')
      setTurns((prev) => prev.slice(0, -1))
    } finally {
      setBusy(false)
    }
  }

  if (signedIn === false) {
    return (
      <div className="border border-border bg-surface p-4">
        <p className="text-sm leading-relaxed text-foreground">Ask this report questions in plain English — grounded strictly in the loaded JSON, citing element and workload ids, and refusing to guess where the data does not reach.</p>
        <p className="mt-3 text-xs text-muted-foreground">Sign in through the Supabase-backed auth UI to use the narration endpoint.</p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-surface">
      <div ref={logRef} className="max-h-80 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <div>
            <p className="text-sm text-muted-foreground">Grounded in the loaded report only. If the answer is not in the data, it says what is missing instead of inventing it.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void ask(s)} className="border border-border px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-amber-dim hover:text-amber">{s}</button>)}
            </div>
          </div>
        ) : turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? '' : 'border-l-2 border-amber-dim pl-3'}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t.role === 'user' ? 'you' : 'narration layer'}</p>
            <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-foreground">{t.content || (busy ? '…' : '')}</div>
            {t.role === 'assistant' && t.content ? <ClaimAudit report={report} text={t.content} /> : null}
          </div>
        ))}
      </div>
      {error ? <p className="mx-4 mb-3 border border-destructive/50 px-3 py-2 text-[11px] text-destructive">{error}</p> : null}
      <form onSubmit={(e) => { e.preventDefault(); void ask(question) }} className="flex gap-2 border-t border-border p-3">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="ask about this report…" className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-amber-dim" />
        <button type="submit" disabled={busy || !question.trim()} className="border border-amber-dim px-3 py-2 text-sm text-amber transition-colors hover:bg-surface-raised disabled:opacity-40">{busy ? '…' : 'Ask'}</button>
      </form>
    </div>
  )
}
