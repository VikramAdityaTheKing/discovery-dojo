import { cn } from '@/lib/utils'

const OUTCOME: Record<string, { text: string; tone: string }> = {
  'closed-won': { text: 'Closed won', tone: 'bg-emerald-500/20 text-emerald-300' },
  'next-meeting': { text: 'Next meeting booked', tone: 'bg-sky-500/15 text-sky-300' },
  stalled: { text: 'Stalled', tone: 'bg-amber-500/15 text-amber-300' },
  lost: { text: 'Lost', tone: 'bg-red-500/15 text-red-300' },
}

/** Deal outcome chip; renders nothing until a call has been scored. */
export function OutcomeBadge({ outcome, className }: { outcome: string; className?: string }) {
  const o = OUTCOME[outcome]
  if (!o) return null
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', o.tone, className)}>{o.text}</span>
}
