/**
 * The post-call MEDDIC scorecard. Pure display: everything it shows was
 * computed by the dojo-end-call action and stored on the session record.
 */

import type { Scorecard as ScorecardData } from '../../dojo/types'
import { cn } from '@/lib/utils'
import { OutcomeBadge } from './OutcomeBadge'

const LABELS: Record<string, string> = {
  metrics: 'Metrics',
  economicBuyer: 'Economic buyer',
  decisionCriteria: 'Decision criteria',
  decisionProcess: 'Decision process',
  identifyPain: 'Identify pain',
  champion: 'Champion',
}

function scoreTone(score: number, max: number) {
  const pct = score / max
  if (pct >= 0.7) return 'bg-emerald-400'
  if (pct >= 0.4) return 'bg-amber-400'
  return 'bg-red-400'
}

export function Scorecard({ card }: { card: ScorecardData }) {
  const talkPct = Math.round(card.talkRatio * 100)
  const talkHealthy = talkPct >= 25 && talkPct <= 50

  return (
    <section data-testid="scorecard" className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start gap-6">
        <div className="text-center">
          <div className="text-5xl font-bold tabular-nums text-primary">{card.total}</div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">out of 100</div>
        </div>
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Call review</h2>
            {card.outcome && <OutcomeBadge outcome={card.outcome.result} />}
          </div>
          {card.outcome?.summary && (
            <p className="mt-1 text-sm text-foreground">
              {card.outcome.summary}
              {card.outcome.attendees ? <span className="text-muted-foreground"> · with {card.outcome.attendees}</span> : null}
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{card.summary}</p>
          <div className="mt-3 text-xs text-muted-foreground">
            Rep talk time{' '}
            <span className={cn('font-semibold', talkHealthy ? 'text-emerald-400' : 'text-amber-400')}>
              {talkPct}%
            </span>{' '}
            <span>(good discovery is usually 25-50%)</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {card.meddic.map((m) => (
          <div key={m.key} className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{m.label || LABELS[m.key] || m.key}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{m.score}/10</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted">
              <div
                className={cn('h-1.5 rounded-full', scoreTone(m.score, 10))}
                style={{ width: `${m.score * 10}%` }}
              />
            </div>
            {m.evidence && (
              <p className="mt-3 text-xs italic text-muted-foreground">"{m.evidence.replace(/^"+|"+$/g, '')}"</p>
            )}
            {m.tip && <p className="mt-2 text-xs text-foreground">Tip: {m.tip}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <List title="Pains you uncovered" items={card.painsUncovered} tone="text-emerald-400" empty="None yet" />
        <List title="Pains you missed" items={card.painsMissed} tone="text-red-400" empty="You found them all" />
        <List title="Turnarounds" items={card.turnarounds ?? []} tone="text-sky-400" empty="No turning points" />
        <List title="Next step to close" items={card.outcome?.nextStep ? [card.outcome.nextStep] : []} tone="text-primary" empty="No next step agreed" />
        <List title="Keep doing" items={card.strengths} />
        <List title="Practice next" items={card.nextSteps} />
      </div>
    </section>
  )
}

function List({ title, items, tone, empty }: { title: string; items: string[]; tone?: string; empty?: string }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {items.length ? (
        <ul className="space-y-1.5 text-sm">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current', tone ?? 'text-muted-foreground')} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty ?? '-'}</p>
      )}
    </div>
  )
}
