/**
 * Discovery Dojo collections.
 *
 * Four collections, one per kind of shared state:
 *
 *   sessions  one practice call: prospect, rep, status, final score.
 *             Everyone signed in can read it (it feeds the leaderboard),
 *             but only the server creates or changes it.
 *   personas  the buyer's HIDDEN brief (pains, objections, budget...).
 *             No member can read it, not even the rep. Only server actions
 *             (which run RBAC-off) and the app admin can. This is what stops
 *             a rep from opening devtools and reading the answers.
 *   turns     the transcript. Read by everyone in the room, written only by
 *             the server, so nobody can forge a buyer line.
 *   notes     manager coaching notes pinned to a turn. Members create them
 *             and can edit/delete only their own.
 *
 * JSON-shaped fields (persona, score, sources) are stored as JSON strings in
 * text columns and parsed in src/dojo/types.ts. Explicit and easy to debug.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const NONE: RolePermissions = { read: false, create: false, update: false, delete: false }
const ADMIN_ALL: RolePermissions = { read: true, create: true, update: true, delete: true }
const READ_ONLY: RolePermissions = { read: true, create: false, update: false, delete: false }

const text = (name: string) => ({ name, storage: 'text' as const, interpretation: 'plain' })
const num = (name: string) => ({ name, storage: 'number' as const, interpretation: 'plain' })

export const sessionsSchema: CollectionSchema = {
  name: 'sessions',
  columns: [
    text('company'), // display name of the prospect company
    text('url'), // the website the rep pasted
    text('repId'), // user id of the rep running the call
    text('repName'),
    // queued -> researching -> ready -> live -> scoring -> scored  (or error)
    text('status'),
    text('buyerName'), // public: who the rep is talking to
    text('buyerTitle'),
    text('brief'), // public pre-call brief: what a rep could know from the website
    text('sources'), // JSON string: [{ title, url }]
    text('score'), // JSON string: Scorecard, set when status = scored
    num('totalScore'), // 0-100, denormalized for leaderboard sorting
    // closed-won | next-meeting | stalled | lost, set by scoring
    text('outcome'),
    text('error'),
  ],
  permissions: {
    viewer: READ_ONLY,
    // Members may delete sessions they created (createdBy = the rep, because
    // the server action writes as the calling user).
    member: { read: true, create: false, update: false, delete: 'own' },
    admin: ADMIN_ALL,
  },
}

export const personasSchema: CollectionSchema = {
  name: 'personas',
  columns: [
    text('sessionId'),
    text('persona'), // JSON string: Persona (hidden pains, objections, MEDDIC truth)
    text('research'), // raw research notes the persona was built from
  ],
  permissions: {
    viewer: NONE,
    member: NONE,
    admin: ADMIN_ALL,
  },
}

export const turnsSchema: CollectionSchema = {
  name: 'turns',
  columns: [
    text('sessionId'),
    num('seq'), // ordering within the call
    text('speaker'), // 'rep' | 'buyer' | 'manager' (a manager stepping into the call)
    text('authorName'), // who spoke, for rep and manager turns
    text('attachment'), // JSON string: Attachment, when a file was shared on this turn
    text('content'),
    // 'true' while the buyer reply is still streaming in. The server updates
    // `content` every few hundred ms, and RecordRoom broadcasts each update,
    // so the rep AND the watching manager see the reply type out live.
    text('streaming'),
  ],
  permissions: {
    viewer: READ_ONLY,
    member: READ_ONLY,
    admin: ADMIN_ALL,
  },
}

export const notesSchema: CollectionSchema = {
  name: 'notes',
  columns: [
    text('sessionId'),
    text('turnId'), // the turn this coaching note is pinned to
    text('authorName'),
    text('content'),
  ],
  permissions: {
    viewer: READ_ONLY,
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: ADMIN_ALL,
  },
}

/**
 * insights: the live AI coach. One row per buyer reply (plus seq 0 = the
 * opener suggestions before the rep says anything). Read by everyone in the
 * room, written only by the server. Built from the transcript and PUBLIC
 * research only, never the hidden persona, so the rep's help is fair.
 */
export const insightsSchema: CollectionSchema = {
  name: 'insights',
  columns: [
    text('sessionId'),
    text('turnId'), // the buyer turn analysed ('' for the opener row)
    num('seq'), // the seq of that turn, 0 for the opener row
    text('signal'), // buying | neutral | pushback | objection | stall | opener
    num('temperature'), // deal temperature 0-100 after this turn
    text('read'), // one line: what the buyer just signalled
    text('coverage'), // JSON string: MeddicCoverage, cumulative
    text('suggestions'), // JSON string: Suggestion[]
    num('picked'), // index the manager recommended, -1 for none
    text('pickedBy'),
  ],
  permissions: {
    viewer: READ_ONLY,
    member: READ_ONLY,
    admin: ADMIN_ALL,
  },
}

export const dojoSchemas: CollectionSchema[] = [sessionsSchema, personasSchema, turnsSchema, notesSchema, insightsSchema]
