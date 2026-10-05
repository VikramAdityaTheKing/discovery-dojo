/**
 * Shared types for Discovery Dojo. Imported by both the worker (server
 * actions) and the React pages, so the two sides can never disagree about
 * the shape of a persona or a scorecard.
 */

export type SessionStatus = 'queued' | 'researching' | 'ready' | 'live' | 'scoring' | 'scored' | 'error'

/** Row shape of the `sessions` collection (see src/schemas/dojo-schemas.ts). */
export interface SessionRow {
  company: string
  url: string
  repId: string
  repName: string
  status: SessionStatus
  buyerName: string
  buyerTitle: string
  brief: string
  sources: string // JSON: Source[]
  score: string // JSON: Scorecard
  totalScore: number
  outcome: string // '' until scored, then DealOutcome['result']
  error: string
}

export interface TurnRow {
  sessionId: string
  seq: number
  speaker: 'rep' | 'buyer' | 'manager'
  authorName: string
  content: string
  streaming: string // 'true' | 'false'
  attachment: string // JSON: Attachment, or ''
}

export interface Attachment {
  name: string
  url: string
  note: string // what the sender said about it
  excerpt: string // text content for .txt/.md/.csv files, so the buyer can read it
}

export type Signal = 'buying' | 'neutral' | 'pushback' | 'objection' | 'stall' | 'opener'

export interface MeddicCoverage {
  metrics: boolean
  economicBuyer: boolean
  decisionCriteria: boolean
  decisionProcess: boolean
  identifyPain: boolean
  champion: boolean
}

export interface Suggestion {
  tactic: string // e.g. 'Dig deeper', 'Handle objection', 'Ask for next step'
  text: string // a ready-to-send line the rep can edit
}

/** Row shape of the `insights` collection: the live coach. */
export interface InsightRow {
  sessionId: string
  turnId: string
  seq: number
  signal: Signal
  temperature: number
  read: string
  coverage: string // JSON: MeddicCoverage
  suggestions: string // JSON: Suggestion[]
  picked: number
  pickedBy: string
}

export interface DealOutcome {
  result: 'closed-won' | 'next-meeting' | 'stalled' | 'lost'
  summary: string // e.g. 'Demo with the CFO next Tuesday'
  nextStep: string
  attendees: string
}

export interface NoteRow {
  sessionId: string
  turnId: string
  authorName: string
  content: string
}

export interface Source {
  title: string
  url: string
}

/**
 * The full buyer persona. Lives only in the hidden `personas` collection.
 * The `meddic` block is the ground truth the scorer compares the rep against.
 */
export interface Persona {
  name: string
  title: string
  company: string
  companySummary: string
  personality: string // how they talk: terse, chatty, skeptical...
  currentSolution: string // what they use today
  hiddenPains: string[] // only revealed if the rep asks good questions
  objections: string[] // raised when the rep pitches too early
  meddic: {
    metrics: string // the number they care about
    economicBuyer: string // who signs (may not be this person)
    decisionCriteria: string
    decisionProcess: string
    pain: string // the core pain in one line
    champion: string // what it would take for them to champion a deal
  }
  openingLine: string // what the buyer says when the call starts
}

export interface MeddicItem {
  key: 'metrics' | 'economicBuyer' | 'decisionCriteria' | 'decisionProcess' | 'identifyPain' | 'champion'
  label: string
  score: number // 0-10
  evidence: string // quote or paraphrase from the transcript
  tip: string // what to do better next time
}

export interface Scorecard {
  total: number // 0-100
  summary: string
  meddic: MeddicItem[]
  painsUncovered: string[] // hidden pains the rep surfaced
  painsMissed: string[] // hidden pains the rep never got to
  talkRatio: number // rep share of words, 0-1
  strengths: string[]
  nextSteps: string[]
  outcome: DealOutcome
  turnarounds: string[] // moments the call recovered, or could have
}

/** Parse a JSON string column without ever throwing in render. */
export function parseJson<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
