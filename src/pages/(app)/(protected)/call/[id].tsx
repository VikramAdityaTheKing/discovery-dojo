/**
 * The call room: /call/:id
 *
 * One page, two roles, decided per session:
 *   - REP      the user who created the session (session.repId). Opens the
 *              call, talks to the buyer, uses the live coach, ends the call.
 *   - MANAGER  anyone else who opens the same link. Sees the hidden buyer
 *              brief, recommends the coach's next moves, pins notes on turns,
 *              and can step into the call and speak to the buyer directly.
 *
 * Everything on screen is live shared state:
 *   useQuery('sessions' | 'turns' | 'notes' | 'insights')  RecordRoom
 *       subscriptions. Any write by anyone (including the server streaming
 *       the buyer reply or the live coach) re-renders every open browser.
 *   usePresenceRoom('call:<id>')              who is in the room right now,
 *       their role, and whether the rep is typing. Ephemeral, never stored.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthProfileReady, usePresenceRoom, useQuery } from 'deepspace'
import { ArrowLeft, Copy, Eye, Loader2, Megaphone, PhoneOff, Trash2 } from 'lucide-react'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Composer, type ComposerHandle } from '../../../../components/dojo/Composer'
import { LivePanel } from '../../../../components/dojo/LivePanel'
import { Scorecard } from '../../../../components/dojo/Scorecard'
import { StatusBadge } from '../../../../components/dojo/StatusBadge'
import { TurnItem } from '../../../../components/dojo/TurnItem'
import { dojoApi } from '../../../../lib/dojo-api'
import type {
  Attachment,
  InsightRow,
  NoteRow,
  Persona,
  Scorecard as ScorecardData,
  SessionRow,
  Source,
  TurnRow,
} from '../../../../dojo/types'
import { parseJson } from '../../../../dojo/types'

export default function CallRoom() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { userId, user } = useAuthProfileReady({ requireUser: true })
  const myName = user?.name || user?.email || 'Someone'

  // --- Live shared state (RecordRoom) -------------------------------------
  const { records: sessionRows, status: sessionStatus } = useQuery<SessionRow>('sessions', {
    where: { recordId: id },
    limit: 1,
  })
  const session = sessionRows[0]
  const { records: turns } = useQuery<TurnRow>('turns', {
    where: { sessionId: id },
    orderBy: 'seq',
    orderDir: 'asc',
    limit: 500,
  })
  const { records: notes } = useQuery<NoteRow>('notes', { where: { sessionId: id }, limit: 500 })
  const { records: insights } = useQuery<InsightRow>('insights', {
    where: { sessionId: id },
    orderBy: 'seq',
    orderDir: 'asc',
    limit: 200,
  })

  const s = session?.data
  const isRep = !!s && s.repId === userId
  const role = isRep ? 'rep' : 'manager'

  // --- Presence (who is here, who is typing) -------------------------------
  const { peers, connected, updateState } = usePresenceRoom(`call:${id}`)
  // Keep the latest updateState in a ref so effects do not re-fire when the
  // hook hands back a new function identity.
  // Only broadcast typing when it flips, not on every keystroke.
  const typingRef = useRef(false)
  const presenceRef = useRef(updateState)
  presenceRef.current = updateState
  // Re-announce on (re)connect: a state update sent before the socket is
  // open would otherwise be lost.
  useEffect(() => {
    if (connected) presenceRef.current({ role, typing: typingRef.current })
  }, [role, connected])
  const setTyping = (typing: boolean) => {
    if (typingRef.current === typing) return
    typingRef.current = typing
    presenceRef.current({ typing })
  }
  // Who is the rep is a FACT on the session record, so we read it from there
  // rather than trusting what each browser says about itself over presence.
  const isPeerRep = (userId: string) => userId === session?.data.repId
  const repTyping = peers.some((p) => isPeerRep(p.userId) && p.state.typing === true)

  // --- Derived ---------------------------------------------------------------
  const notesByTurn = useMemo(() => {
    const map = new Map<string, typeof notes>()
    for (const n of notes) {
      const list = map.get(n.data.turnId) ?? []
      list.push(n)
      map.set(n.data.turnId, list)
    }
    return map
  }, [notes])
  const buyerStreaming = turns.some((t) => t.data.streaming === 'true')
  const scorecard = parseJson<ScorecardData | null>(s?.score, null)
  const sources = parseJson<Source[]>(s?.sources, [])

  // Keep the transcript scrolled to the newest words, including while the
  // buyer reply streams in.
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastContent = turns.at(-1)?.data.content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, lastContent])

  // --- Actions ---------------------------------------------------------------
  const [sending, setSending] = useState(false)
  const [stepIn, setStepIn] = useState(false)
  const repComposer = useRef<ComposerHandle>(null)
  const managerComposer = useRef<ComposerHandle>(null)
  const [ending, setEnding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  /** Rep or manager speaks. Resolves once the buyer has finished replying. */
  const send = async (content: string, attachment: Attachment | null): Promise<boolean> => {
    if (sending) return false
    setSending(true)
    try {
      await dojoApi.sendTurn(id, content, myName, attachment)
      // Kick off the live coach on the new reply. Not awaited: the panel
      // shows "reading the reply" and fills in when the insight row lands.
      dojoApi.analyze(id).catch(() => undefined)
      return true
    } catch (e) {
      toast.error('Message not sent', (e as Error).message)
      return false
    } finally {
      setSending(false)
    }
  }

  /** A suggestion's "Use" / "Say it myself" loads it into the right box. */
  const applySuggestion = (text: string) => {
    if (isRep) repComposer.current?.fill(text)
    else {
      setStepIn(true)
      // Wait a tick for the manager composer to mount.
      setTimeout(() => managerComposer.current?.fill(text), 0)
    }
  }

  const endCall = async () => {
    setEnding(true)
    try {
      const { total } = await dojoApi.endCall(id)
      toast.success('Call scored', `You scored ${total}/100`)
    } catch (e) {
      toast.error('Could not score the call', (e as Error).message)
    } finally {
      setEnding(false)
    }
  }

  const copyCoachLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    toast.info('Link copied', 'Anyone who opens it joins as a manager.')
  }

  const deleteSession = async () => {
    setDeleting(true)
    try {
      await dojoApi.deleteSession(id)
      navigate('/home')
    } catch (e) {
      toast.error('Could not delete', (e as Error).message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // --- Render ----------------------------------------------------------------
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {sessionStatus === 'loading' ? 'Loading call...' : 'This call does not exist or was deleted.'}
      </div>
    )
  }

  const preparing = s!.status === 'queued' || s!.status === 'researching'
  const canTalk = isRep && (s!.status === 'ready' || s!.status === 'live')
  const live = s!.status === 'live'

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col px-4 py-4">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <Link to="/home" className="text-muted-foreground hover:text-foreground" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{s!.company}</h1>
            <StatusBadge status={s!.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {s!.buyerName ? `${s!.buyerName}, ${s!.buyerTitle}` : s!.url} · rep: {s!.repName}
          </p>
        </div>
        <div className="flex-1" />

        {/* Presence: everyone else currently in this room */}
        <div className="flex items-center gap-2" data-testid="presence">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              isRep ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-400',
            )}
          >
            You: {isRep ? 'Rep' : 'Manager'}
          </span>
          {peers.map((p) => (
            <span
              key={p.userId}
              title={`${p.userName} (${isPeerRep(p.userId) ? 'rep' : 'manager'})`}
              className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {p.userName.split(' ')[0]}
              <span className="text-muted-foreground">{isPeerRep(p.userId) ? 'rep' : 'mgr'}</span>
            </span>
          ))}
        </div>

        <Button size="sm" variant="outline" onClick={copyCoachLink}>
          <Copy /> Invite manager
        </Button>
        {isRep && s!.status === 'live' && (
          <Button size="sm" variant="destructive" loading={ending} disabled={buyerStreaming} onClick={endCall}>
            <PhoneOff /> End call & score
          </Button>
        )}
        {isRep && (s!.status === 'scored' || s!.status === 'error') && (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete session">
            <Trash2 />
          </Button>
        )}
      </header>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void deleteSession()}
        loading={deleting}
        title={`Delete the ${s!.company} call?`}
        description="This removes the transcript, coaching notes, buyer persona and score. It also drops the call from the leaderboard. This cannot be undone."
        confirmText="Delete call"
      />

      <div className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="flex min-h-0 flex-col">
          {s!.status === 'scored' && scorecard && (
            <div className="mb-4 max-h-[55%] overflow-y-auto">
              <Scorecard card={scorecard} />
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-background/40 p-4">
            {preparing && <PreparingPanel company={s!.company} status={s!.status} />}
            {s!.status === 'error' && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                Something went wrong while building this buyer: {s!.error || 'unknown error'}.{' '}
                <Link to="/home" className="underline">
                  Start a new call
                </Link>
              </div>
            )}
            {s!.status === 'ready' && turns.length === 0 && (
              <div className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">
                  {isRep ? `You are calling ${s!.buyerName}.` : `Waiting for the rep to call ${s!.buyerName}.`}
                </p>
                <p>
                  {isRep
                    ? 'You speak first. Pick an opener from the live coach or write your own.'
                    : 'The rep opens the call. You can recommend one of the openers on the right.'}
                </p>
              </div>
            )}
            {turns.map((t) => (
              <TurnItem
                key={t.recordId}
                turn={t}
                notes={notesByTurn.get(t.recordId) ?? []}
                buyerName={s!.buyerName}
                canCoach={!isRep}
                myUserId={userId}
                myName={myName}
              />
            ))}
            {s!.status === 'scoring' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Grading the call against MEDDIC...
              </div>
            )}
            {!isRep && repTyping && <div className="text-xs text-muted-foreground">Rep is typing...</div>}
            <div ref={bottomRef} />
          </div>

          {/* Composer: the rep talks; a manager can step in */}
          {isRep ? (
            <Composer
              ref={repComposer}
              tone="rep"
              busy={sending}
              disabled={!canTalk || sending || buyerStreaming}
              placeholder={
                !canTalk
                  ? 'The call is not open for talking right now'
                  : turns.length === 0
                    ? 'Open the call... (Enter to send, Shift+Enter for a new line)'
                    : 'Ask a discovery question... (Enter to send, Shift+Enter for a new line)'
              }
              onSend={send}
              onTyping={setTyping}
            />
          ) : stepIn && live ? (
            <Composer
              ref={managerComposer}
              tone="manager"
              busy={sending}
              disabled={sending || buyerStreaming}
              placeholder={`You are on the call: ${s!.buyerName || 'the buyer'} hears you as the rep's manager`}
              onSend={async (content, attachment) => {
                const ok = await send(content, attachment)
                if (ok) setStepIn(false)
                return ok
              }}
            />
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <span>Coaching as manager: recommend a next move, or hover a line and click "Add note".</span>
              {live && (
                <Button size="sm" variant="outline" onClick={() => setStepIn(true)}>
                  <Megaphone /> Step into the call
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="min-h-0 space-y-4 overflow-y-auto">
          {s!.status !== 'scored' && (
            <LivePanel
              insights={insights}
              turns={turns}
              isRep={isRep}
              live={live}
              myName={myName}
              onUse={applySuggestion}
            />
          )}
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pre-call brief
            </h2>
            <p className="text-sm">{s!.brief || 'Research in progress...'}</p>
            {sources.length > 0 && (
              <ul className="mt-3 space-y-1">
                {sources.map((src) => (
                  <li key={src.url} className="truncate text-xs">
                    <a href={src.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                      {src.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <HiddenBrief sessionId={id} isRep={isRep} status={s!.status} />
        </aside>
      </div>
    </div>
  )
}

function PreparingPanel({ company, status }: { company: string; status: string }) {
  const steps = [
    'Firecrawl is reading the website',
    'Exa is searching the web and recent news',
    'Claude is building a buyer with hidden pains and objections',
  ]
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-primary" />
      <h2 className="font-semibold">Researching {company}</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {status === 'queued' ? 'Starting up...' : 'This takes about 20-40 seconds.'}
      </p>
      <ul className="space-y-1 text-left text-sm text-muted-foreground">
        {steps.map((step) => (
          <li key={step}>- {step}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The buyer's hidden brief. It is never in the synced data the rep's browser
 * receives: it comes from the dojo-reveal-persona action, which only answers
 * managers, or the rep once the call has been scored.
 */
function HiddenBrief({ sessionId, isRep, status }: { sessionId: string; isRep: boolean; status: string }) {
  const [persona, setPersona] = useState<Persona | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const available = !isRep || status === 'scored'
  const ready = status !== 'queued' && status !== 'researching' && status !== 'error'

  const reveal = async () => {
    setLoading(true)
    setError('')
    try {
      setPersona((await dojoApi.revealPersona(sessionId)).persona)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!ready) return null

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
        Buyer's hidden brief
      </h2>
      {!available && (
        <p className="text-xs text-muted-foreground">
          Locked for the rep until the call is scored. Your manager can see it.
        </p>
      )}
      {available && !persona && (
        <Button size="sm" variant="outline" loading={loading} onClick={reveal}>
          <Eye /> Reveal
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {persona && (
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">{persona.personality}</p>
          <div>
            <div className="mb-1 font-semibold text-foreground">Hidden pains</div>
            <ul className="list-disc space-y-1 pl-4">
              {persona.hiddenPains.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 font-semibold text-foreground">Objections</div>
            <ul className="list-disc space-y-1 pl-4">
              {persona.objections.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 font-semibold text-foreground">MEDDIC truth</div>
            <dl className="space-y-1">
              <div><dt className="inline text-muted-foreground">Metrics: </dt><dd className="inline">{persona.meddic.metrics}</dd></div>
              <div><dt className="inline text-muted-foreground">Economic buyer: </dt><dd className="inline">{persona.meddic.economicBuyer}</dd></div>
              <div><dt className="inline text-muted-foreground">Criteria: </dt><dd className="inline">{persona.meddic.decisionCriteria}</dd></div>
              <div><dt className="inline text-muted-foreground">Process: </dt><dd className="inline">{persona.meddic.decisionProcess}</dd></div>
              <div><dt className="inline text-muted-foreground">Champion: </dt><dd className="inline">{persona.meddic.champion}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </section>
  )
}
