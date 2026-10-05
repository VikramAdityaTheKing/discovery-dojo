/**
 * /home: the dojo floor.
 *
 *  - Start a new practice call by pasting a prospect's website.
 *  - See every call in the workspace live (status updates stream in through
 *    RecordRoom), so a manager can jump into any call that is running now.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthGate, AuthOverlay, useAuthProfileReady, useQuery } from 'deepspace'
import { ArrowRight, Radio } from 'lucide-react'
import { Sparkle } from '../../components/Starfield'
import { Button, Input, useToast } from '@/components/ui'
import { OutcomeBadge } from '../../components/dojo/OutcomeBadge'
import { StatusBadge } from '../../components/dojo/StatusBadge'
import { dojoApi } from '../../lib/dojo-api'
import type { SessionRow } from '../../dojo/types'

/**
 * One-click demo prospects. The first four are well-known SaaS buyers; the
 * rest are teams shipping collaborative or AI-native products, the kind of
 * company that would plausibly evaluate DeepSpace. deep.space is the backup
 * demo: the interviewer gets to sell to their own company.
 */
const SAMPLE_SITES = [
  'gong.io',
  'linear.app',
  'ramp.com',
  'notion.so',
  'attio.com',
  'clay.com',
  'retool.com',
  'replit.com',
  'miro.com',
  'tldraw.com',
  'deep.space',
]

export default function HomePage() {
  return (
    <AuthGate fallback={<SignedOut />}>
      <Dojo />
    </AuthGate>
  )
}

function Dojo() {
  const navigate = useNavigate()
  const toast = useToast()
  const { userId, user } = useAuthProfileReady({ requireUser: true })
  const [url, setUrl] = useState('')
  const [starting, setStarting] = useState(false)

  const { records: sessions, status } = useQuery<SessionRow>('sessions', {
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 50,
  })
  const liveNow = sessions.filter((s) => ['researching', 'ready', 'live', 'scoring'].includes(s.data.status))
  const mine = sessions.filter((s) => s.data.repId === userId)

  const start = async (target: string) => {
    if (!target.trim()) return
    setStarting(true)
    try {
      const { sessionId } = await dojoApi.createSession(target, user?.name || user?.email || 'Rep')
      // Fire the slow research step and move on. We do not await it: the call
      // room watches the session's `status` field live and shows progress.
      dojoApi.prepareSession(sessionId).catch((e: Error) => toast.error('Research failed', e.message))
      navigate(`/call/${sessionId}`)
    } catch (e) {
      toast.error('Could not start the call', (e as Error).message)
      setStarting(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void start(url)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <section className="mb-12">
        <span className="chip mb-5">
          <Sparkle className="h-2.5 w-2.5" /> Discovery Dojo
        </span>
        <h1 className="display mb-4 text-5xl text-foreground sm:text-6xl">Who are you calling today?</h1>
        <p className="mb-8 max-w-2xl font-light text-muted-foreground">
          Paste a prospect's website. We research the company, build a buyer with real pains and objections,
          and put you on a live call with an AI coach reading every reply. Invite your manager to recommend the
          next move or step in to close.
        </p>
        <form onSubmit={onSubmit} className="flex max-w-2xl gap-2">
          <Input
            data-testid="url-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="acme.com"
            className="h-12 flex-1 rounded-full bg-background/60 px-5"
            disabled={starting}
          />
          <Button type="submit" size="lg" className="btn-glow h-12 rounded-full" loading={starting} disabled={!url.trim()}>
            Start call <ArrowRight />
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Try:
          {SAMPLE_SITES.map((site) => (
            <button
              key={site}
              type="button"
              disabled={starting}
              onClick={() => void start(site)}
              className="rounded-full border border-border bg-background/40 px-2.5 py-1 transition-colors hover:border-primary hover:text-foreground"
            >
              {site}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Radio className="h-4 w-4 text-emerald-400" /> Happening now
        </h2>
        {liveNow.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls running. Start one above.</p>
        ) : (
          <SessionList sessions={liveNow} userId={userId} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your calls</h2>
        {status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. Your first call is one URL away.</p>
        ) : (
          <SessionList sessions={mine} userId={userId} />
        )}
      </section>
    </div>
  )
}

function SessionList({
  sessions,
  userId,
}: {
  sessions: { recordId: string; data: SessionRow; createdAt: string }[]
  userId: string | null
}) {
  return (
    <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">
      {sessions.map((s) => (
        <li key={s.recordId}>
          <Link to={`/call/${s.recordId}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{s.data.company}</div>
              <div className="truncate text-xs text-muted-foreground">
                {s.data.buyerName ? `${s.data.buyerName}, ${s.data.buyerTitle}` : s.data.url}
                {' · '}
                {s.data.repId === userId ? 'you' : s.data.repName}
                {' · '}
                {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
            {s.data.status === 'scored' && (
              <>
                <OutcomeBadge outcome={s.data.outcome} />
                <span className="text-lg font-semibold tabular-nums text-primary">{s.data.totalScore}</span>
              </>
            )}
            <StatusBadge status={s.data.status} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SignedOut() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <Sparkle className="mx-auto mb-6 h-8 w-8 text-foreground" />
        <h1 className="display mb-4 text-5xl text-foreground">Practice the call. Then win the real one.</h1>
        <p className="mb-6 text-muted-foreground">Sign in to start a call, or join one as a manager.</p>
        <Button size="lg" className="btn-glow rounded-full" onClick={() => setOpen(true)}>
          Sign in
        </Button>
      </div>
      {open && <AuthOverlay onClose={() => setOpen(false)} />}
    </div>
  )
}
