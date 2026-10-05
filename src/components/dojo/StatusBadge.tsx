import { cn } from '@/lib/utils'
import type { SessionStatus } from '../../dojo/types'

const LABELS: Record<SessionStatus, { text: string; tone: string }> = {
  queued: { text: 'Queued', tone: 'bg-muted text-muted-foreground' },
  researching: { text: 'Researching', tone: 'bg-amber-500/15 text-amber-400' },
  ready: { text: 'Ready to dial', tone: 'bg-sky-500/15 text-sky-400' },
  live: { text: 'Live', tone: 'bg-emerald-500/15 text-emerald-400' },
  scoring: { text: 'Scoring', tone: 'bg-amber-500/15 text-amber-400' },
  scored: { text: 'Scored', tone: 'bg-primary/15 text-primary' },
  error: { text: 'Error', tone: 'bg-destructive/15 text-destructive' },
}

export function StatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  const s = LABELS[status] ?? LABELS.queued
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        s.tone,
        className,
      )}
    >
      {status === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
      {s.text}
    </span>
  )
}
