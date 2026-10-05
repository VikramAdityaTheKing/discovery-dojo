/**
 * Browser-side wrapper for the Discovery Dojo server actions.
 *
 * Every call is POST /api/actions/<name> with the user's JWT as a bearer
 * token. The worker verifies the token, so the server always knows who is
 * calling. We never send a user id from the browser.
 */

import { getAuthToken } from 'deepspace'
import type { Attachment, Persona } from '../dojo/types'

type Envelope<T> = { success: true; data: T } | { success: false; error: string } | { error?: string }

async function callAction<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken()
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (body && 'success' in body && body.success) return body.data
  const message = body && 'error' in body && body.error ? body.error : `Request failed (${res.status})`
  throw new Error(message)
}

export const dojoApi = {
  createSession: (url: string, userName: string) =>
    callAction<{ sessionId: string }>('dojo-create-session', { url, userName }),
  prepareSession: (sessionId: string) =>
    callAction<{ status: string }>('dojo-prepare-session', { sessionId }),
  /** Rep or manager speaks. The server decides which from the JWT. */
  sendTurn: (sessionId: string, content: string, userName: string, attachment?: Attachment | null) =>
    callAction<{ turnId: string }>('dojo-send-turn', { sessionId, content, userName, attachment }),
  /** Run the live coach on the latest buyer reply (idempotent per turn). */
  analyze: (sessionId: string) => callAction<{ signal?: string }>('dojo-analyze', { sessionId }),
  /** Manager recommends one of the coach's suggestions (-1 clears it). */
  pickSuggestion: (insightId: string, index: number, userName: string) =>
    callAction<{ picked: number }>('dojo-pick-suggestion', { insightId, index, userName }),
  endCall: (sessionId: string) => callAction<{ total: number; outcome: string }>('dojo-end-call', { sessionId }),
  revealPersona: (sessionId: string) =>
    callAction<{ persona: Persona }>('dojo-reveal-persona', { sessionId }),
  deleteSession: (sessionId: string) =>
    callAction<{ deleted: boolean }>('dojo-delete-session', { sessionId }),
}
