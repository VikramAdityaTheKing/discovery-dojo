/**
 * Landing page, a STATIC page (no auth call, no WebSocket). It lives at the
 * top level of src/pages/, outside (app)/, so it is prerendered to plain HTML
 * at build time. Keep it renderable without a browser.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const STEPS = [
  [
    'Research in seconds',
    'Paste a prospect website. Firecrawl and Exa pull the company, the news and the context, and AI briefs you before you dial.',
  ],
  [
    'Open strong, adapt live',
    'A live coach reads every buyer reply: the signal, the deal temperature, which MEDDIC boxes are ticked, and three next moves.',
  ],
  [
    'Manager in the loop',
    'Your manager joins the same room, recommends the next move, pins notes on the moment, or steps into the call to close.',
  ],
  [
    'Close and review',
    'Book the next meeting or win the deal, then get a MEDDIC scorecard with evidence from your own words and a team leaderboard.',
  ],
]

const ROADMAP = [
  ['Today', 'Practice room: an AI buyer built from a real prospect, with the live coach and your manager on the call.'],
  ['Next', 'Live assist on real calls: the same coach and manager tools beside a conversation with an actual buyer.'],
  ['Then', 'Voice and video calls, and deal outcomes pushed straight into your CRM.'],
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Discovery Dojo</p>
        <h1 className="mb-5 max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          Practice the call. Then win the real one.
        </h1>
        <p className="mb-10 max-w-2xl text-lg text-muted-foreground">
          A multiplayer sales room where AI researches the prospect, plays a buyer who pushes back and coaches every
          reply, while your manager watches, recommends the next move or steps in to close. Built as a practice room
          today, and designed to become the copilot on your real sales calls.
        </p>
        <div>
          <Link
            to="/home"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Enter the dojo
          </Link>
        </div>

        <ol className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="border-t border-border pt-4">
              <div className="mb-2 text-xs tabular-nums text-primary">0{i + 1}</div>
              <div className="mb-1 font-semibold">{title}</div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>

        <section className="mt-16 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            From practice room to sales engine
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            {ROADMAP.map(([when, what]) => (
              <div key={when}>
                <dt className="mb-1 font-semibold text-foreground">{when}</dt>
                <dd className="text-sm text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  )
}
