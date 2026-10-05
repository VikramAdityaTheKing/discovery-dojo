/**
 * Prospect research: turn a website URL into a pile of facts Claude can
 * build a buyer persona from.
 *
 * Three sources, each optional, run in parallel:
 *   1. Firecrawl scrapes the homepage into clean markdown.
 *   2. Exa neural search finds what the web says about the company.
 *   3. Exa news search finds recent news (funding, launches, layoffs).
 *
 * All three go through `tools.integration(...)`, the DeepSpace integration
 * proxy: no Firecrawl or Exa keys live in this app, and billing lands on
 * the app owner (see src/integrations.ts).
 *
 * Every step degrades gracefully. If Firecrawl fails we fetch the page
 * ourselves; if Exa fails we continue with what we have. A demo should
 * never die because one vendor had a bad minute.
 */

import type { ActionTools } from 'deepspace/worker'
import type { Source } from '../../dojo/types'

export interface ResearchResult {
  company: string
  notes: string // everything we learned, as plain text for the prompt
  sources: Source[]
}

const MAX_SITE_CHARS = 8000
const MAX_RESULT_CHARS = 1200

type Json = Record<string, unknown>

const asRecord = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Normalise what the user typed: "acme.com" -> "https://acme.com". */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withScheme) // throws on garbage, caller turns it into a 400
  return url.toString()
}

/** "https://www.acme-robotics.com/x" -> "Acme Robotics" (a fallback name). */
function nameFromHost(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '')
  const label = host.split('.')[0] ?? host
  return label
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** 1. Firecrawl: homepage as markdown. */
async function scrapeSite(tools: ActionTools, url: string) {
  const res = await tools.integration<Json>('firecrawl/scrape', {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
  })
  if (!res.success) {
    console.warn(`[research] firecrawl/scrape failed: ${res.error}`)
    return null
  }
  // The proxy returns Firecrawl's own body: { success, data: { markdown, metadata } }.
  // Read both shapes defensively in case the envelope is flattened.
  const body = asRecord(res.data)
  const data = asRecord(body.data ?? body)
  const metadata = asRecord(data.metadata)
  const markdown = asString(data.markdown)
  if (!markdown) return null
  return {
    // og:site_name is usually the clean brand ("Ramp"); <title> is often a slogan.
    siteName: asString(metadata.ogSiteName),
    title: asString(metadata.title) || asString(metadata.ogTitle),
    text: markdown.slice(0, MAX_SITE_CHARS),
  }
}

/** Fallback when Firecrawl is unavailable: plain fetch + crude tag strip. */
async function fetchSiteDirectly(url: string) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (DiscoveryDojo research bot)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? ''
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1]?.trim() ?? ''
    return text ? { siteName, title, text: text.slice(0, MAX_SITE_CHARS) } : null
  } catch {
    return null
  }
}

/** 2 + 3. Exa search and news search share one response reader. */
async function exaSearch(tools: ActionTools, endpoint: 'exa/search' | 'exa/news-search', query: string) {
  const body =
    endpoint === 'exa/search'
      ? { query, numResults: 5, contents: { text: { maxCharacters: MAX_RESULT_CHARS } } }
      : { query, numResults: 5 }
  const res = await tools.integration<Json>(endpoint, body)
  if (!res.success) {
    console.warn(`[research] ${endpoint} failed: ${res.error}`)
    return []
  }
  const results = asRecord(res.data).results
  if (!Array.isArray(results)) return []
  return results.map((r) => {
    const row = asRecord(r)
    return {
      title: asString(row.title) || asString(row.url),
      url: asString(row.url),
      text: (asString(row.text) || asString(row.summary) || asString(row.highlight)).slice(0, MAX_RESULT_CHARS),
      date: asString(row.publishedDate),
    }
  })
}

export async function researchCompany(tools: ActionTools, url: string): Promise<ResearchResult> {
  // The site comes first because its title gives us the company name for
  // the search queries.
  const site = (await scrapeSite(tools, url)) ?? (await fetchSiteDirectly(url))
  const hostName = nameFromHost(url)
  // Prefer the brand name; a page title like "Spend Management | Ramp" is a
  // slogan first, so only use its shortest segment as a last resort.
  const titleParts = (site?.title ?? '').split(/[|\-\u2013:]/).map((p) => p.trim()).filter(Boolean)
  const shortest = titleParts.sort((a, b) => a.length - b.length)[0]
  const company = (site?.siteName || (shortest && shortest.length <= 25 ? shortest : '') || hostName).slice(0, 60)
  const host = new URL(url).hostname.replace(/^www\./, '')

  const [web, news] = await Promise.all([
    exaSearch(tools, 'exa/search', `${company} (${host}) company: customers, products, pricing, competitors`),
    exaSearch(tools, 'exa/news-search', `${company} ${host}`),
  ])

  const sections: string[] = []
  if (site) sections.push(`## Company website (${url})\n${site.text}`)
  if (web.length) {
    sections.push(
      '## Web results\n' + web.map((r) => `- ${r.title} (${r.url})\n  ${r.text}`).join('\n'),
    )
  }
  if (news.length) {
    sections.push(
      '## Recent news\n' +
        news.map((r) => `- ${r.date ? `[${r.date.slice(0, 10)}] ` : ''}${r.title} (${r.url})\n  ${r.text}`).join('\n'),
    )
  }
  if (!sections.length) {
    // Nothing worked. Still let Claude invent a plausible buyer from the
    // domain alone rather than failing the whole session.
    sections.push(`## Note\nNo research could be retrieved. Only the domain is known: ${host}.`)
  }

  const sources: Source[] = [
    { title: `${company} website`, url },
    ...[...web, ...news].filter((r) => r.url).slice(0, 6).map((r) => ({ title: r.title, url: r.url })),
  ]

  return { company, notes: sections.join('\n\n'), sources }
}
