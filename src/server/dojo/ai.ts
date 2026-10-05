/**
 * LLM access for Discovery Dojo.
 *
 * Every model call goes through the DeepSpace API proxy via
 * `createDeepSpaceAI`. The app never holds an Anthropic/OpenAI key: in dev,
 * `deepspace dev start` writes the proxy URL and an owner token into
 * .dev.vars; in production the deploy mints them.
 *
 * We do NOT pass `authToken`, so calls are billed to the app owner
 * (APP_OWNER_JWT). That keeps the demo working for users who have no credits
 * of their own. To bill each user instead, pass `{ authToken: callerJwt }`.
 *
 * FALLBACK CHAIN: a model can be refused (402 Payment Required when a plan
 * does not include it or credits run out, 429 when rate limited, 5xx when a
 * provider has a bad minute). Each task lists models best-first and we walk
 * down the list until one answers, so the call never dies on one provider.
 */

import { generateText, streamText, type ModelMessage } from 'ai'
import { createDeepSpaceAI } from 'deepspace/worker'
import type { DeepSpaceAIProvider } from 'deepspace/worker'
import type { Env } from '../../../worker'

interface ModelChoice {
  provider: DeepSpaceAIProvider
  id: string
}

const m = (provider: DeepSpaceAIProvider, id: string): ModelChoice => ({ provider, id })

/** Persona building and scoring: one-shot, quality matters most. */
export const ANALYST_MODELS: ModelChoice[] = [
  m('anthropic', 'claude-opus-5-5'),
  m('anthropic', 'claude-sonnet-5'),
  m('anthropic', 'claude-haiku-4-5'),
  m('openai', 'gpt-6-luna'),
  m('cerebras', 'gpt-oss-120b'),
]

/** The live buyer: speed matters most. */
export const BUYER_MODELS: ModelChoice[] = [
  m('anthropic', 'claude-sonnet-5'),
  m('anthropic', 'claude-haiku-4-5'),
  m('openai', 'gpt-6-luna'),
  m('cerebras', 'gpt-oss-120b'),
]

/** The live coach runs after every buyer reply: fastest and cheapest first. */
export const COACH_MODELS: ModelChoice[] = [
  m('anthropic', 'claude-haiku-4-5'),
  m('anthropic', 'claude-sonnet-5'),
  m('openai', 'gpt-6-luna'),
  m('cerebras', 'gpt-oss-120b'),
]

function model(env: Env, choice: ModelChoice) {
  return createDeepSpaceAI(env, choice.provider)(choice.id)
}

function describe(err: unknown): string {
  const e = err as { statusCode?: number; message?: string }
  return `${e?.statusCode ?? ''} ${e?.message ?? String(err)}`.trim()
}

/** One-shot generation, walking the fallback chain. */
export async function generateWithFallback(
  env: Env,
  models: ModelChoice[],
  prompt: string,
): Promise<{ text: string; modelId: string }> {
  const errors: string[] = []
  for (const choice of models) {
    try {
      const { text } = await generateText({ model: model(env, choice), prompt })
      if (text.trim()) return { text, modelId: choice.id }
      errors.push(`${choice.id}: empty reply`)
    } catch (err) {
      console.warn(`[ai] ${choice.id} failed, trying next: ${describe(err)}`)
      errors.push(`${choice.id}: ${describe(err)}`)
    }
  }
  throw new Error(`All models failed. ${errors.join(' | ')}`)
}

/**
 * Streaming generation, walking the fallback chain. `onText` gets the full
 * text so far after every chunk. We only fall back if a model fails BEFORE
 * it produced any text; once words are on screen we keep what we have.
 */
export async function streamWithFallback(
  env: Env,
  models: ModelChoice[],
  opts: { system: string; messages: ModelMessage[]; maxOutputTokens: number },
  onText: (text: string) => Promise<void>,
): Promise<{ text: string; modelId: string }> {
  const errors: string[] = []
  for (const choice of models) {
    let text = ''
    try {
      const result = streamText({ model: model(env, choice), ...opts })
      for await (const delta of result.textStream) {
        text += delta
        await onText(text)
      }
      if (text.trim()) return { text, modelId: choice.id }
      errors.push(`${choice.id}: empty reply`)
    } catch (err) {
      if (text.trim()) return { text, modelId: choice.id }
      console.warn(`[ai] ${choice.id} stream failed, trying next: ${describe(err)}`)
      errors.push(`${choice.id}: ${describe(err)}`)
    }
  }
  throw new Error(`All models failed. ${errors.join(' | ')}`)
}

/**
 * House style, enforced in code rather than hoped for in a prompt: models love
 * em and en dashes, and they read as machine-written. Every model string we
 * store passes through here. Safe on JSON text too (it never touches quotes).
 */
export function tidy(text: string): string {
  return text
    .replace(/(\d)\s*\u2013\s*(\d)/g, '$1-$2') // 20\u201340 -> 20-40
    .replace(/\s*[\u2014\u2013]\s*/g, ', ') // a \u2014 b -> a, b
    .replace(/,\s*([,.!?])/g, '$1') // no ", ." leftovers
}

/**
 * Pull the first JSON object out of a model reply. Models sometimes wrap JSON
 * in ```json fences or add a sentence before it, so we look for the outermost
 * braces instead of trusting the whole string.
 */
export function extractJson<T>(text: string): T {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('Model reply did not contain a JSON object')
  }
  return JSON.parse(text.slice(start, end + 1)) as T
}
