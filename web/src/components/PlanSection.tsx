import { Badge, CopyButton, EmptyState, SectionHeading } from './primitives'
import type { Report } from '../lib/report'

function riskTone(risk: string): 'none' | 'low' | 'medium' | 'high' {
  if (risk === 'none' || risk === 'low' || risk === 'medium' || risk === 'high') return risk
  return 'medium'
}

export function PlanSection({ report }: { report: Report }) {
  const steps = report.plan

  return (
    <section aria-labelledby="plan-heading" className="scroll-mt-8" id="plan">
      <SectionHeading note="greedy set cover: maximum CVE mass per unit of breakage risk — review before applying, nothing is ever auto-applied">
        <span id="plan-heading">Hardening plan</span>
      </SectionHeading>

      {steps.length === 0 ? (
        <EmptyState
          title="No hardening steps available for this host."
          hint="Every reachable element already carries its mitigation, or no curated mitigation exists for what is reachable."
        />
      ) : (
        <ol className="border-t border-rule">
          {steps.map((step) => (
            <li key={step.step} className="grid gap-5 border-b border-rule py-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div>
                <p className="flex flex-wrap items-center gap-3">
                  <span className="tnum text-xs text-ink-faint">step</span>
                  <span className="tnum text-2xl font-extrabold text-amber">{step.step}</span>
                  <Badge tone={riskTone(step.breakage_risk)}>breakage: {step.breakage_risk}</Badge>
                  {step.requires_reboot ? <Badge tone="dim">reboot</Badge> : null}
                </p>
                <p className="mt-3 text-sm font-bold text-ink">
                  {step.action.replace(/_/g, ' ')}
                </p>
                <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-dim">
                  kills{' '}
                  <span className="tnum font-bold text-ink">{step.cves_killed}</span> reachable
                  {' '}{step.cves_killed === 1 ? 'CVE' : 'CVEs'} · removes{' '}
                  <span className="tnum font-bold text-ink">{step.weight_removed}</span>{' '}
                  weighted units · targets:{' '}
                  {step.targets.slice(0, 6).join(', ')}
                  {step.targets.length > 6 ? ` +${step.targets.length - 6} more` : ''}
                </p>
                <dl className="mt-4 space-y-2 text-xs">
                  <div>
                    <dt className="inline text-ink-faint">detect: </dt>
                    <dd className="inline text-ink-dim">{step.detection}</dd>
                  </div>
                  <div>
                    <dt className="inline text-ink-faint">revert: </dt>
                    <dd className="inline text-amber-deep">{step.revert}</dd>
                  </div>
                </dl>
              </div>

              <figure className="min-w-0 border border-rule bg-ground">
                <figcaption className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
                  <code className="truncate text-xs text-ink-dim">{step.artifact.path}</code>
                  <CopyButton text={step.artifact.content ?? ''} />
                </figcaption>
                <pre className="max-h-72 overflow-auto p-4 text-xs leading-relaxed text-ink-dim whitespace-pre-wrap break-words">
                  {step.artifact.content}
                </pre>
              </figure>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
