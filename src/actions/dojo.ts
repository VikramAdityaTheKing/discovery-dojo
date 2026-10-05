/**
 * Discovery Dojo server actions.
 *
 * Every action is reached as POST /api/actions/<name> with the caller's JWT
 * (see src/server/action-routes.ts). The route verifies WHO is calling and
 * hands us `userId`. The `tools` it gives us run with per-record RBAC OFF,
 * so THIS FILE is the authorization boundary: every action checks that the
 * caller is allowed to do what they ask.
 *
 *   dojo-create-session   rep pastes a URL -> empty session row (fast)
 *   dojo-prepare-session  research + persona + opener suggestions (slow)
 *   dojo-send-turn        rep (or a manager stepping in) speaks -> streamed buyer reply
 *   dojo-analyze          live coach on the latest buyer reply
 *   dojo-pick-suggestion  manager recommends one of the coach's next moves
 *   dojo-end-call         MEDDIC scoring + deal outcome -> leaderboard
 *   dojo-reveal-persona   hidden brief, for managers (or the rep after scoring)
 *   dojo-delete-session   rep deletes their session and everything under it
 */

import type { ModelMessage } from 'ai'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type {
  Attachment,
  DealOutcome,
  InsightRow,
  MeddicCoverage,
  MeddicItem,
  NoteRow,
  Persona,
  Scorecard,
  SessionRow,
  Signal,
  Suggestion,
  TurnRow,
} from '../dojo/types'
import { parseJson } from '../dojo/types'
import {
  ANALYST_MODELS,
  BUYER_MODELS,
  COACH_MODELS,
  extractJson,
  generateWithFallback,
  streamWithFallback,
  tidy,
} from '../server/dojo/ai'
import {
  attachmentText,
  buyerSystemPrompt,
  coachPrompt,
  openerPrompt,
  personaPrompt,
  scoringPrompt,
} from '../server/dojo/prompts'
import { normalizeUrl, researchCompany } from '../server/dojo/research'

type Action = ActionHandler<Env>
type Fail = { success: false; error: string }
const fail = (error: string): Fail => ({ success: false, error })

const MAX_TURN_CHARS = 2000
const MAX_EXCERPT_CHARS = 4000
/** How often a streaming buyer reply is flushed to the shared record. */
const STREAM_FLUSH_MS = 250

const NO_COVERAGE: MeddicCoverage = {
  metrics: false,
  economicBuyer: false,
  decisionCriteria: false,
  decisionProcess: false,
  identifyPain: false,
  champion: false,
}
const SIGNALS: Signal[] = ['buying', 'neutral', 'pushback', 'objection', 'stall']

// ---------------------------------------------------------------------------
// Small helpers shared by the actions
// ---------------------------------------------------------------------------

type Row<T> = T & Record<string, unknown>

async function loadSession(tools: ActionTools, sessionId: unknown) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  const res = await tools.get<Row<SessionRow>>('sessions', sessionId)
  return res.success ? res.data.record.data : null
}

async function loadPersonaRow(tools: ActionTools, sessionId: string) {
  const res = await tools.query<{ persona: string; research: string }>('personas', { where: { sessionId }, limit: 1 })
  return res.success ? (res.data.records[0]?.data ?? null) : null
}

async function loadPersona(tools: ActionTools, sessionId: string): Promise<Persona | null> {
  const row = await loadPersonaRow(tools, sessionId)
  return row ? parseJson<Persona | null>(row.persona, null) : null
}

async function loadTurns(tools: ActionTools, sessionId: string) {
  const res = await tools.query<Row<TurnRow>>('turns', {
    where: { sessionId },
    orderBy: 'seq',
    orderDir: 'asc',
    limit: 500,
  })
  return res.success ? res.data.records : []
}

async function loadNotes(tools: ActionTools, sessionId: string): Promise<NoteRow[]> {
  const res = await tools.query<Row<NoteRow>>('notes', { where: { sessionId }, limit: 200 })
  return res.success ? res.data.records.map((r) => r.data as NoteRow) : []
}

function displayName(params: Record<string, unknown>, fallback: string): string {
  return typeof params.userName === 'string' && params.userName.trim() ? params.userName.trim().slice(0, 80) : fallback
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const clamp = (n: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(n) || 0))

/** Keep exactly 3 well-formed suggestions, whatever the model sent back. */
function cleanSuggestions(raw: unknown): Suggestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => ({
      tactic: tidy(String((s as Suggestion)?.tactic ?? '')).slice(0, 40),
      text: tidy(String((s as Suggestion)?.text ?? '')).slice(0, 400),
    }))
    .filter((s) => s.text)
    .slice(0, 3)
}

/** Validate a file the browser says it uploaded. Only our own file URLs. */
function cleanAttachment(raw: unknown): Attachment | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Partial<Attachment>
  const url = String(a.url ?? '')
  if (!url.startsWith('/api/files/') && !/^https:\/\/[^/]+\/api\/files\//.test(url)) return null
  return {
    name: String(a.name ?? 'file').slice(0, 120),
    url,
    note: String(a.note ?? '').slice(0, 500),
    excerpt: String(a.excerpt ?? '').slice(0, MAX_EXCERPT_CHARS),
  }
}

// ---------------------------------------------------------------------------
// 1. Create: fast, so the UI can navigate to the room immediately
// ---------------------------------------------------------------------------

/**
 * Every model and integration call is billed to the app owner, so a public
 * demo needs a ceiling. Counted from the sessions table itself: no extra state.
 */
const MAX_CALLS_PER_DAY = 8

const createSession: Action = async ({ userId, params, tools, env }) => {
  if (userId !== env.OWNER_USER_ID) {
    const mine = await tools.query<Row<SessionRow>>('sessions', { where: { repId: userId }, orderBy: 'createdAt', orderDir: 'desc', limit: MAX_CALLS_PER_DAY })
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    const today = mine.success ? mine.data.records.filter((r) => Date.parse(String(r.createdAt)) > dayAgo).length : 0
    if (today >= MAX_CALLS_PER_DAY) {
      return fail(`You have started ${MAX_CALLS_PER_DAY} calls in the last 24 hours. That is the daily limit for this demo, so come back tomorrow.`)
    }
  }
  let url: string
  try {
    url = normalizeUrl(String(params.url ?? ''))
  } catch {
    return fail('That does not look like a website URL.')
  }
  const host = new URL(url).hostname.replace(/^www\./, '')
  const row: SessionRow = {
    company: host,
    url,
    repId: userId,
    repName: displayName(params, 'Rep'),
    status: 'queued',
    buyerName: '',
    buyerTitle: '',
    brief: '',
    sources: '[]',
    score: '',
    totalScore: 0,
    outcome: '',
    error: '',
  }
  const created = await tools.create('sessions', row as unknown as Record<string, unknown>)
  if (!created.success) return fail(created.error)
  return { success: true, data: { sessionId: created.data.recordId } }
}

// ---------------------------------------------------------------------------
// 2. Prepare: research -> persona -> opener suggestions. The REP opens the
//    call, so there is no buyer line yet; the coach suggests how to open.
// ---------------------------------------------------------------------------

const prepareSession: Action = async ({ userId, params, tools, env }) => {
  const sessionId = String(params.sessionId ?? '')
  const session = await loadSession(tools, sessionId)
  if (!session) return fail('Session not found')
  if (session.repId !== userId) return fail('Only the rep can prepare this session')
  // Idempotent: a refresh or double click must not research twice.
  if (session.status !== 'queued') return { success: true, data: { status: session.status } }

  await tools.update('sessions', sessionId, { status: 'researching' })

  try {
    const research = await researchCompany(tools, session.url)
    await tools.update('sessions', sessionId, {
      company: research.company,
      sources: JSON.stringify(research.sources),
    })

    const host = new URL(session.url).hostname.replace(/^www\./, '')
    const { text, modelId } = await generateWithFallback(env, ANALYST_MODELS, personaPrompt(research.company, host, research.notes))
    console.info(`[dojo] persona for ${sessionId} built by ${modelId}`)
    const parsed = extractJson<{ brief: string; persona: Persona }>(tidy(text))
    const persona = parsed.persona
    if (!persona?.name || !Array.isArray(persona.hiddenPains)) {
      throw new Error('Persona was missing required fields')
    }

    // Hidden half: only server actions and the admin can read this collection.
    await tools.create('personas', {
      sessionId,
      persona: JSON.stringify(persona),
      research: research.notes.slice(0, 20_000),
    })

    // Public half: what the rep sees before dialing. The rep can start now.
    const company = persona.company || research.company
    const brief = parsed.brief ?? ''
    await tools.update('sessions', sessionId, {
      company,
      buyerName: persona.name,
      buyerTitle: persona.title,
      brief,
      status: 'ready',
    })

    // Opener suggestions (insight row seq 0). Public research only.
    try {
      const opener = await generateWithFallback(
        env,
        COACH_MODELS,
        openerPrompt({ company, buyerName: persona.name, buyerTitle: persona.title, brief, research: research.notes }),
      )
      const suggestions = cleanSuggestions(extractJson<{ suggestions: unknown }>(opener.text).suggestions)
      await tools.create('insights', {
        sessionId,
        turnId: '',
        seq: 0,
        signal: 'opener',
        temperature: 30,
        read: `Cold call. ${persona.name} has not heard of you yet: earn 30 seconds with a specific reason for calling.`,
        coverage: JSON.stringify(NO_COVERAGE),
        suggestions: JSON.stringify(suggestions),
        picked: -1,
        pickedBy: '',
      } satisfies InsightRow as unknown as Record<string, unknown>)
    } catch (err) {
      console.warn(`[dojo] opener suggestions failed: ${errorText(err)}`)
    }
    return { success: true, data: { status: 'ready' } }
  } catch (err) {
    console.error(`[dojo] prepare failed for ${sessionId}: ${errorText(err)}`)
    await tools.update('sessions', sessionId, { status: 'error', error: errorText(err).slice(0, 600) })
    return fail('Could not build the buyer persona. Try again or try another URL.')
  }
}

// ---------------------------------------------------------------------------
// 3. Send turn: the heart of the live call.
//
// The rep speaks; a manager may also step in and speak. We write that line,
// create an EMPTY buyer turn with streaming='true', then stream the reply
// into that record every 250ms. RecordRoom broadcasts each update, so the
// rep and every manager watch the buyer "type" over one shared channel.
// ---------------------------------------------------------------------------

/** Turn the transcript into model messages. Rep/manager = user, buyer = assistant. */
function toMessages(turns: TurnRow[]): ModelMessage[] {
  const raw: ModelMessage[] = turns.map((t): ModelMessage => {
    if (t.speaker === 'buyer') return { role: 'assistant', content: t.content }
    const file = t.attachment ? `\n${attachmentText(t.attachment)}` : ''
    const said =
      t.speaker === 'manager'
        ? `[The rep's sales manager, ${t.authorName || 'their manager'}, joins the call and says:] ${t.content}`
        : t.content
    return { role: 'user', content: `${said}${file}` }
  })
  // Stage direction on the very first line, and merge any back-to-back
  // same-role messages so providers that require alternation are happy.
  if (raw[0]?.role === 'user') raw[0] = { role: 'user', content: `[Your phone rings. You pick up.]\n${raw[0].content}` }
  const merged: ModelMessage[] = []
  for (const m of raw) {
    const prev = merged.at(-1)
    if (prev && prev.role === m.role) {
      merged[merged.length - 1] = { ...prev, content: `${prev.content}\n${m.content}` } as ModelMessage
    } else merged.push(m)
  }
  return merged
}

const sendTurn: Action = async ({ userId, params, tools, env }) => {
  const sessionId = String(params.sessionId ?? '')
  const content = tidy(String(params.content ?? '')).trim()
  const attachment = cleanAttachment(params.attachment)
  if (!content && !attachment) return fail('Say something first.')
  if (content.length > MAX_TURN_CHARS) return fail(`Keep it under ${MAX_TURN_CHARS} characters.`)

  const session = await loadSession(tools, sessionId)
  if (!session) return fail('Session not found')
  const isRep = session.repId === userId
  if (isRep && session.status !== 'ready' && session.status !== 'live') return fail(`The call is ${session.status}.`)
  // A manager can step in only once the rep has opened the call.
  if (!isRep && session.status !== 'live') return fail('A manager can step in once the rep has opened the call.')

  const persona = await loadPersona(tools, sessionId)
  if (!persona) return fail('Buyer persona is missing')

  const history = await loadTurns(tools, sessionId)
  if (history.some((t) => t.data.streaming === 'true')) return fail('Wait for the buyer to finish talking.')
  const nextSeq = (history.at(-1)?.data.seq ?? 0) + 1

  const line: TurnRow = {
    sessionId,
    seq: nextSeq,
    speaker: isRep ? 'rep' : 'manager',
    authorName: displayName(params, isRep ? session.repName : 'Manager'),
    content: content || '(shares a file)',
    streaming: 'false',
    attachment: attachment ? JSON.stringify(attachment) : '',
  }
  await tools.create('turns', line as unknown as Record<string, unknown>)
  const buyerTurn = await tools.create('turns', {
    sessionId,
    seq: nextSeq + 1,
    speaker: 'buyer',
    authorName: persona.name,
    content: '',
    streaming: 'true',
    attachment: '',
  })
  if (!buyerTurn.success) return fail(buyerTurn.error)
  const buyerTurnId = buyerTurn.data.recordId
  if (session.status === 'ready') await tools.update('sessions', sessionId, { status: 'live' })

  const messages = toMessages([...history.map((t) => t.data as TurnRow), line])

  let text = ''
  let lastFlush = 0
  try {
    const result = await streamWithFallback(
      env,
      BUYER_MODELS,
      { system: buyerSystemPrompt(persona), messages, maxOutputTokens: 400 },
      async (soFar) => {
        // Throttle: one shared-record write per STREAM_FLUSH_MS, not per token.
        const now = Date.now()
        if (now - lastFlush >= STREAM_FLUSH_MS) {
          lastFlush = now
          await tools.update('turns', buyerTurnId, { content: tidy(soFar) })
        }
      },
    )
    text = result.text
  } catch (err) {
    console.error(`[dojo] buyer stream failed: ${errorText(err)}`)
    text = '(The line crackles. The buyer did not catch that, can you repeat?)'
  }

  await tools.update('turns', buyerTurnId, { content: tidy(text).trim(), streaming: 'false' })
  return { success: true, data: { turnId: buyerTurnId } }
}

// ---------------------------------------------------------------------------
// 4. Analyze: the live coach. Runs on the latest finished buyer reply.
//    Idempotent per turn, so a double call never writes two insights.
//    Reads the transcript, public brief and notes; NEVER the hidden persona.
// ---------------------------------------------------------------------------

const analyze: Action = async ({ params, tools, env }) => {
  const sessionId = String(params.sessionId ?? '')
  const session = await loadSession(tools, sessionId)
  if (!session) return fail('Session not found')
  if (session.status !== 'live') return { success: true, data: { skipped: 'not live' } }

  const turns = await loadTurns(tools, sessionId)
  const last = [...turns].reverse().find((t) => t.data.speaker === 'buyer')
  if (!last || last.data.streaming === 'true') return { success: true, data: { skipped: 'no finished reply' } }

  const existing = await tools.query<Row<InsightRow>>('insights', {
    where: { sessionId },
    orderBy: 'seq',
    orderDir: 'desc',
    limit: 1,
  })
  const latest = existing.success ? existing.data.records[0]?.data : undefined
  if (latest && latest.turnId === last.recordId) return { success: true, data: { skipped: 'already analysed' } }
  const previous = parseJson<MeddicCoverage>(latest?.coverage, NO_COVERAGE)

  try {
    const { text } = await generateWithFallback(
      env,
      COACH_MODELS,
      coachPrompt({
        company: session.company,
        buyerName: session.buyerName,
        buyerTitle: session.buyerTitle,
        brief: session.brief,
        turns: turns.map((t) => t.data as TurnRow),
        notes: await loadNotes(tools, sessionId),
        previous,
      }),
    )
    const raw = extractJson<{
      signal: string
      temperature: number
      read: string
      coverage: Partial<MeddicCoverage>
      suggestions: unknown
    }>(text)
    // Coverage only ever grows: once uncovered, an element stays uncovered.
    const coverage = Object.fromEntries(
      (Object.keys(NO_COVERAGE) as (keyof MeddicCoverage)[]).map((k) => [k, previous[k] || raw.coverage?.[k] === true]),
    ) as unknown as MeddicCoverage
    const row: InsightRow = {
      sessionId,
      turnId: last.recordId,
      seq: last.data.seq,
      signal: SIGNALS.includes(raw.signal as Signal) ? (raw.signal as Signal) : 'neutral',
      temperature: clamp(raw.temperature, 0, 100),
      read: tidy(String(raw.read ?? '')).slice(0, 300),
      coverage: JSON.stringify(coverage),
      suggestions: JSON.stringify(cleanSuggestions(raw.suggestions)),
      picked: -1,
      pickedBy: '',
    }
    await tools.create('insights', row as unknown as Record<string, unknown>)
    return { success: true, data: { signal: row.signal } }
  } catch (err) {
    console.warn(`[dojo] coach failed for ${sessionId}: ${errorText(err)}`)
    return fail('The live coach could not read that reply.')
  }
}

// ---------------------------------------------------------------------------
// 5. Pick suggestion: the manager is the decision point. They recommend one
//    of the coach's next moves and it lights up on the rep's screen.
// ---------------------------------------------------------------------------

const pickSuggestion: Action = async ({ userId, params, tools }) => {
  const insightId = String(params.insightId ?? '')
  const index = Number(params.index)
  const res = await tools.get<Row<InsightRow>>('insights', insightId)
  if (!res.success) return fail('Suggestion not found')
  const session = await loadSession(tools, res.data.record.data.sessionId)
  if (!session) return fail('Session not found')
  if (session.repId === userId) return fail('The manager recommends; the rep chooses.')
  const count = parseJson<Suggestion[]>(res.data.record.data.suggestions, []).length
  const picked = Number.isInteger(index) && index >= -1 && index < count ? index : -1
  await tools.update('insights', insightId, { picked, pickedBy: displayName(params, 'Manager') })
  return { success: true, data: { picked } }
}

// ---------------------------------------------------------------------------
// 6. End call: score with MEDDIC, record the deal outcome, save to the
//    session (= the leaderboard)
// ---------------------------------------------------------------------------

/** Seller-side (rep + manager) share of words spoken. Computed in code. */
function talkRatio(turns: TurnRow[]): number {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length
  let seller = 0
  let all = 0
  for (const t of turns) {
    const n = words(t.content)
    all += n
    if (t.speaker !== 'buyer') seller += n
  }
  return all ? Math.round((seller / all) * 100) / 100 : 0
}

/** Labels come from code, not the model, so the scorecard always reads right. */
const MEDDIC_LABELS: Record<MeddicItem['key'], string> = {
  metrics: 'Metrics',
  economicBuyer: 'Economic buyer',
  decisionCriteria: 'Decision criteria',
  decisionProcess: 'Decision process',
  identifyPain: 'Identify pain',
  champion: 'Champion',
}

/** Models sometimes wrap a quote in its own quote marks; the UI adds them. */
const unquote = (s: unknown) => String(s ?? '').trim().replace(/^["“]+|["”]+$/g, '')

const OUTCOMES: DealOutcome['result'][] = ['closed-won', 'next-meeting', 'stalled', 'lost']

const endCall: Action = async ({ userId, params, tools, env }) => {
  const sessionId = String(params.sessionId ?? '')
  const session = await loadSession(tools, sessionId)
  if (!session) return fail('Session not found')
  if (session.repId !== userId) return fail('Only the rep can end the call')
  if (session.status !== 'live') return fail('Have at least one exchange before ending the call.')

  const persona = await loadPersona(tools, sessionId)
  if (!persona) return fail('Buyer persona is missing')
  const turns = (await loadTurns(tools, sessionId)).map((r) => r.data as TurnRow)
  const notes = await loadNotes(tools, sessionId)

  await tools.update('sessions', sessionId, { status: 'scoring', error: '' })

  try {
    const { text, modelId } = await generateWithFallback(env, ANALYST_MODELS, scoringPrompt(persona, turns, notes))
    console.info(`[dojo] call ${sessionId} scored by ${modelId}`)
    const raw = extractJson<Omit<Scorecard, 'total' | 'talkRatio'>>(tidy(text))
    const meddic: MeddicItem[] = (raw.meddic ?? []).map((m) => ({
      ...m,
      label: MEDDIC_LABELS[m.key] ?? m.label ?? m.key,
      score: clamp(m.score, 0, 10),
      evidence: unquote(m.evidence),
    }))
    // Total is computed in code from the six sub-scores, so the model cannot
    // hand out a 95 with a list of zeros.
    const total = Math.round((meddic.reduce((sum, m) => sum + m.score, 0) / 60) * 100)
    const outcome: DealOutcome = {
      result: OUTCOMES.includes(raw.outcome?.result) ? raw.outcome.result : 'stalled',
      summary: String(raw.outcome?.summary ?? ''),
      nextStep: String(raw.outcome?.nextStep ?? ''),
      attendees: String(raw.outcome?.attendees ?? ''),
    }
    const scorecard: Scorecard = {
      total,
      summary: raw.summary ?? '',
      meddic,
      painsUncovered: raw.painsUncovered ?? [],
      painsMissed: raw.painsMissed ?? [],
      talkRatio: talkRatio(turns),
      strengths: raw.strengths ?? [],
      nextSteps: raw.nextSteps ?? [],
      turnarounds: raw.turnarounds ?? [],
      outcome,
    }
    await tools.update('sessions', sessionId, {
      status: 'scored',
      score: JSON.stringify(scorecard),
      totalScore: total,
      outcome: outcome.result,
    })
    return { success: true, data: { total, outcome: outcome.result } }
  } catch (err) {
    console.error(`[dojo] scoring failed for ${sessionId}: ${errorText(err)}`)
    // Put the call back to live so the rep can retry "End call".
    await tools.update('sessions', sessionId, { status: 'live', error: 'Scoring failed, try again.' })
    return fail('Scoring failed. Try ending the call again.')
  }
}

// ---------------------------------------------------------------------------
// 7. Reveal persona: managers see the hidden brief so they can coach.
//    The rep only sees it after the call is scored.
// ---------------------------------------------------------------------------

const revealPersona: Action = async ({ userId, params, tools }) => {
  const sessionId = String(params.sessionId ?? '')
  const session = await loadSession(tools, sessionId)
  if (!session) return fail('Session not found')
  const isRep = session.repId === userId
  if (isRep && session.status !== 'scored') {
    return fail('No peeking. The buyer brief unlocks after your call is scored.')
  }
  const persona = await loadPersona(tools, sessionId)
  if (!persona) return fail('Persona not ready yet')
  return { success: true, data: { persona } }
}

// ---------------------------------------------------------------------------
// 8. Delete: cascade through every collection that hangs off the session
// ---------------------------------------------------------------------------

async function drain(tools: ActionTools, collection: string, sessionId: string) {
  for (;;) {
    const res: ActionResult<{ deleted: number }> = await tools.deleteWhere(collection, { sessionId }, 500)
    if (!res.success || res.data.deleted < 500) return
  }
}

const deleteSession: Action = async ({ userId, params, tools }) => {
  const sessionId = String(params.sessionId ?? '')
  const session = await loadSession(tools, sessionId)
  if (!session) return fail('Session not found')
  if (session.repId !== userId) return fail('Only the rep can delete this session')
  for (const c of ['turns', 'notes', 'insights', 'personas']) await drain(tools, c, sessionId)
  await tools.remove('sessions', sessionId)
  return { success: true, data: { deleted: true } }
}

export const dojoActions: Record<string, Action> = {
  'dojo-create-session': createSession,
  'dojo-prepare-session': prepareSession,
  'dojo-send-turn': sendTurn,
  'dojo-analyze': analyze,
  'dojo-pick-suggestion': pickSuggestion,
  'dojo-end-call': endCall,
  'dojo-reveal-persona': revealPersona,
  'dojo-delete-session': deleteSession,
}
