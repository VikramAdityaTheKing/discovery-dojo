/**
 * The live deal panel, shown to BOTH the rep and the manager.
 *
 * Everything here is derived from synced records, so it updates in every
 * browser at once:
 *   insights  -> deal temperature + trend, buyer signal, live MEDDIC coverage,
 *                and three next moves from the live coach
 *   turns     -> live talk ratio (computed right here, no model needed)
 *
 * The two roles get different buttons on the same suggestions:
 *   rep      "Use"        loads the line into the composer to edit and send
 *   manager  "Recommend"  highlights it on the rep's screen (the manager is
 *                         the decision point), or "Say it" to step in directly
 */

import { useState } from 'react'
import type { RecordData } from 'deepspace'
import { Check, Loader2, Sparkles, ThumbsUp } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { dojoApi } from '../../lib/dojo-api'
import type { InsightRow, MeddicCoverage, Signal, Suggestion, TurnRow } from '../../dojo/types'
import { parseJson } from '../../dojo/types'

const SIGNAL_STYLE: Record<Signal, { label: string; tone: string }> = {
  opener: { label: 'Before the call', tone: 'bg-muted text-muted-foreground' },
  buying: { label: 'Buying signal', tone: 'bg-emerald-500/15 text-emerald-400' },
  neutral: { label: 'Neutral', tone: 'bg-sky-500/15 text-sky-400' },
  pushback: { label: 'Pushback', tone: 'bg-amber-500/15 text-amber-400' },
  objection: { label: 'Objection', tone: 'bg-orange-500/15 text-orange-400' },
  stall: { label: 'Stalling', tone: 'bg-red-500/15 text-red-400' },
}

const MEDDIC_ROWS: { key: keyof MeddicCoverage; label: string; ask: string }[] = [
  { key: 'metrics', label: 'Metrics', ask: 'what number would prove success?' },
  { key: 'economicBuyer', label: 'Economic buyer', ask: 'who signs?' },
  { key: 'decisionCriteria', label: 'Decision criteria', ask: 'how will they judge options?' },
  { key: 'decisionProcess', label: 'Decision process', ask: 'what are the steps and dates?' },
  { key: 'identifyPain', label: 'Identify pain', ask: 'what hurts, and what does it cost?' },
  { key: 'champion', label: 'Champion', ask: 'who will sell this internally?' },
]

function tempTone(t: number) {
  if (t >= 65) return 'text-emerald-400'
  if (t >= 40) return 'text-amber-400'
  return 'text-red-400'
}

/** Tiny inline trend line of deal temperature across the call. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 120
  const h = 28
  const step = w / (values.length - 1)
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Deal temperature trend" className="overflow-visible">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
    </svg>
  )
}

interface Props {
  insights: RecordData<InsightRow>[]
  turns: RecordData<TurnRow>[]
  isRep: boolean
  live: boolean
  myName: string
  onUse: (text: string) => void
}

export function LivePanel({ insights, turns, isRep, live, myName, onUse }: Props) {
  const toast = useToast()
  const [picking, setPicking] = useState<number | null>(null)
  const latest = insights.at(-1)
  const data = latest?.data
  const suggestions = parseJson<Suggestion[]>(data?.suggestions, [])
  const coverage = parseJson<MeddicCoverage | null>(data?.coverage, null)
  const temps = insights.filter((i) => i.data.signal !== 'opener').map((i) => i.data.temperature)

  // The coach is "thinking" when the newest buyer reply has no insight yet.
  const lastBuyer = [...turns].reverse().find((t) => t.data.speaker === 'buyer')
  const coachBusy =
    live && !!lastBuyer && lastBuyer.data.streaming !== 'true' && !insights.some((i) => i.data.turnId === lastBuyer.recordId)

  // Live talk ratio: seller side (rep + manager) vs buyer, by words.
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length
  let seller = 0
  let all = 0
  for (const t of turns) {
    const n = words(t.data.content)
    all += n
    if (t.data.speaker !== 'buyer') seller += n
  }
  const talkPct = all ? Math.round((seller / all) * 100) : 0

  const recommend = async (index: number) => {
    if (!latest) return
    setPicking(index)
    try {
      await dojoApi.pickSuggestion(latest.recordId, data?.picked === index ? -1 : index, myName)
    } catch (e) {
      toast.error('Could not recommend', (e as Error).message)
    } finally {
      setPicking(null)
    }
  }

  if (!data) return null
  const signal = SIGNAL_STYLE[data.signal] ?? SIGNAL_STYLE.neutral

  return (
    <section data-testid="live-panel" className="rounded-xl border border-primary/30 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Live coach
        </h2>
        {coachBusy && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> reading the reply
          </span>
        )}
      </div>

      {/* Temperature + signal */}
      {data.signal !== 'opener' && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className={cn('text-3xl font-bold tabular-nums', tempTone(data.temperature))}>{data.temperature}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">deal temperature</div>
          </div>
          <Sparkline values={temps} />
        </div>
      )}
      <div className="mb-3">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', signal.tone)}>{signal.label}</span>
        {data.read && <p className="mt-2 text-xs text-muted-foreground">{data.read}</p>}
      </div>

      {/* Next moves */}
      {suggestions.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {data.signal === 'opener' ? 'Ways to open' : 'Next moves'}
          </div>
          {suggestions.map((s, i) => {
            const picked = data.picked === i
            return (
              <div
                key={i}
                data-testid="suggestion"
                className={cn(
                  'rounded-lg border p-2.5 text-xs',
                  picked ? 'border-amber-500/60 bg-amber-500/10' : 'border-border bg-background/40',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{s.tactic}</span>
                  {picked && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400">
                      <ThumbsUp className="h-3 w-3" /> {data.pickedBy || 'Manager'} recommends
                    </span>
                  )}
                </div>
                <p className="mb-2 text-muted-foreground">{s.text}</p>
                <div className="flex gap-1.5">
                  {isRep ? (
                    <Button size="sm" variant={picked ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => onUse(s.text)}>
                      Use
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant={picked ? 'default' : 'outline'}
                        className="h-7 px-2 text-xs"
                        loading={picking === i}
                        onClick={() => void recommend(i)}
                      >
                        <ThumbsUp /> {picked ? 'Recommended' : 'Recommend'}
                      </Button>
                      {live && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onUse(s.text)}>
                          Say it myself
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Live MEDDIC coverage + talk ratio */}
      <div className="space-y-1 text-xs">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>MEDDIC coverage</span>
          <span className={cn('normal-case tracking-normal', talkPct > 60 ? 'text-amber-400' : 'text-muted-foreground')}>
            you talk {talkPct}%
          </span>
        </div>
        {MEDDIC_ROWS.map((row) => {
          const done = coverage?.[row.key] === true
          return (
            <div key={row.key} className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                  done ? 'border-emerald-400 bg-emerald-400/20 text-emerald-400' : 'border-border',
                )}
              >
                {done && <Check className="h-2.5 w-2.5" />}
              </span>
              <span className={done ? 'text-foreground' : 'text-muted-foreground'}>
                <b className="font-medium">{row.label}</b>: {row.ask}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
