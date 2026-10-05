/**
 * /leaderboard: shared, live rankings.
 *
 * There is no separate leaderboard table. A scored session IS a leaderboard
 * entry: `dojo-end-call` writes `totalScore` onto the session, and this page
 * subscribes to scored sessions ordered by that column. When anyone finishes
 * a call, every open leaderboard updates on its own.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthProfileReady, useQuery } from 'deepspace'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OutcomeBadge } from '../../../components/dojo/OutcomeBadge'
import type { SessionRow } from '../../../dojo/types'

interface RepStats {
  repId: string
  repName: string
  calls: number
  best: number
  average: number
  advanced: number // calls that ended closed-won or with a next meeting booked
}

export default function LeaderboardPage() {
  const { userId } = useAuthProfileReady()
  const [view, setView] = useState<'reps' | 'calls'>('reps')
  const { records, status } = useQuery<SessionRow>('sessions', {
    where: { status: 'scored' },
    orderBy: 'totalScore',
    orderDir: 'desc',
    limit: 200,
  })

  // Roll individual calls up into one row per rep.
  const reps = useMemo<RepStats[]>(() => {
    const byRep = new Map<string, { repName: string; scores: number[]; advanced: number }>()
    for (const r of records) {
      const entry = byRep.get(r.data.repId) ?? { repName: r.data.repName, scores: [], advanced: 0 }
      entry.scores.push(r.data.totalScore)
      if (r.data.outcome === 'closed-won' || r.data.outcome === 'next-meeting') entry.advanced += 1
      byRep.set(r.data.repId, entry)
    }
    return [...byRep.entries()]
      .map(([repId, { repName, scores, advanced }]) => ({
        repId,
        repName,
        calls: scores.length,
        best: Math.max(...scores),
        average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        advanced,
      }))
      .sort((a, b) => b.average - a.average || b.best - a.best)
  }, [records])

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="chip mb-4">
            <Trophy className="h-3 w-3" /> Live rankings
          </span>
          <h1 className="display text-5xl text-foreground">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">MEDDIC scores from every graded discovery call. Updates live.</p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5 text-sm">
          {(['reps', 'calls'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-3 py-1.5',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'reps' ? 'By rep' : 'Top calls'}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No graded calls yet. Finish a call to claim the top spot.</p>
      ) : view === 'reps' ? (
        <table data-testid="leaderboard" className="glass w-full overflow-hidden rounded-2xl text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Rep</th>
              <th className="px-4 py-3 text-right">Calls</th>
              <th className="px-4 py-3 text-right">Deals advanced</th>
              <th className="px-4 py-3 text-right">Best</th>
              <th className="px-4 py-3 text-right">Average</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r, i) => (
              <tr key={r.repId} className={cn('border-b border-border last:border-0', r.repId === userId && 'bg-primary/5')}>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3 font-medium">
                  {r.repName}
                  {r.repId === userId && <span className="ml-2 text-xs text-primary">you</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.calls}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.advanced}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.best}</td>
                <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-primary">{r.average}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">
          {records.map((r, i) => (
            <li key={r.recordId}>
              <Link to={`/call/${r.recordId}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
                <span className="w-6 tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.data.repName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.data.company} · {r.data.buyerName}, {r.data.buyerTitle}
                  </div>
                </div>
                <OutcomeBadge outcome={r.data.outcome} />
                <span className="text-lg font-semibold tabular-nums text-primary">{r.data.totalScore}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
