/**
 * Landing page, a STATIC page (no auth call, no WebSocket), prerendered to
 * plain HTML at build time. Styled after deep.space: starfield (mounted in
 * _app.tsx), thin display type, tracked chips, glass cards, a typing
 * terminal and a ticker. Every animation is CSS, so the prerendered HTML is
 * complete without JavaScript.
 */

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Github } from 'lucide-react'
import { Seo } from '../components/Seo'
import { Sparkle } from '../components/Starfield'
import { seo } from '../seo'

const REPO = 'https://github.com/VikramAdityaTheKing/discovery-dojo'

const delay = (s: number) => ({ '--d': `${s}s` }) as CSSProperties

const SEATS = [
  {
    seat: 'The rep',
    line: 'Opens the call and runs discovery.',
    body: 'Three AI openers before the first word. After every buyer reply, three next moves to pick from, edit and send.',
  },
  {
    seat: 'The manager',
    line: 'Sits in, live, from anywhere.',
    body: 'Sees the buyer brief the rep cannot. Recommends the next move, pins notes on the moment, or steps in to close.',
  },
  {
    seat: 'The AI',
    line: 'Plays the buyer and coaches the room.',
    body: 'A buyer built from the real company who pushes back, and a coach that reads every reply: signal, temperature, MEDDIC.',
  },
]

const FEATURES = [
  ['Research in seconds', 'Firecrawl reads the website, Exa finds the news, and you get a pre-call brief before you dial.'],
  ['A buyer who pushes back', 'Hidden pains surface only for good questions. Pitch too early and you hear the objection.'],
  ['Live coach', 'Buyer signal, deal temperature, MEDDIC coverage and talk ratio, updated after every reply.'],
  ['Manager as decision point', 'Recommend a move and it lights up on the rep screen. Or take the call and speak to the buyer.'],
  ['Deals you can win', 'Earn it and the buyer books the next meeting, agrees a pilot or buys on the first call.'],
  ['Review that teaches', 'A MEDDIC scorecard with quotes from your own words, pains you missed, turnarounds and the outcome.'],
]

const PRIMITIVES = [
  ['RecordRoom', 'every message, coach insight and note syncs live'],
  ['Presence', 'who is in the room, who is typing'],
  ['Collection RBAC', 'the buyer brief never reaches the rep'],
  ['Server actions', 'the one place that decides who may do what'],
  ['AI proxy', 'Claude, with OpenAI and Cerebras as fallbacks'],
  ['Integrations', 'Firecrawl scrape, Exa search and news'],
  ['R2 files', 'share a one-pager on the call'],
  ['Auth', 'Google sign-in, role per call'],
]

const TICKER = 'LIVE COACH /// MANAGER IN THE LOOP /// BUYERS WHO PUSH BACK /// MEDDIC SCORED /// DEALS YOU CAN WIN /// BUILT ON DEEPSPACE /// '

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="relative">
        {/* Top bar */}
        <header className="fixed inset-x-0 top-0 z-30 border-b border-border/60 bg-background/40 backdrop-blur-md">
          <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6 text-sm">
            <Link to="/" className="flex items-center gap-2 font-medium text-foreground">
              <Sparkle className="h-3.5 w-3.5" /> Discovery Dojo
            </Link>
            <div className="hidden items-center gap-5 text-muted-foreground md:flex">
              <a href="#how" className="hover:text-foreground">How it works</a>
              <a href="#seats" className="hover:text-foreground">Three seats</a>
              <a href="#built" className="hover:text-foreground">Built on DeepSpace</a>
              <a href="#next" className="hover:text-foreground">Roadmap</a>
            </div>
            <div className="flex-1" />
            <a href={REPO} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 text-muted-foreground hover:text-foreground sm:flex">
              <Github className="h-4 w-4" /> Code
            </a>
            <Link to="/home" className="btn-glow rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
              Enter the dojo
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-14 text-center">
          <Sparkle className="mb-6 h-10 w-10 text-foreground drop-shadow-[0_0_18px_rgba(160,160,255,0.8)]" />
          <h1 className="display text-6xl text-foreground sm:text-8xl">Discovery Dojo</h1>
          <span className="chip mt-5">The multiplayer sales room</span>
          <p className="mt-6 max-w-xl text-lg font-light text-muted-foreground">
            AI researches the prospect, plays a buyer who pushes back and coaches every reply. Your manager sits in,
            recommends the next move, or steps in to close.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link to="/home" className="btn-glow inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background">
              Enter the dojo <ArrowRight className="h-4 w-4" />
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
              Read the code
            </a>
          </div>
          <a href="#how" className="mt-16 flex flex-col items-center gap-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Scroll <ChevronDown className="h-4 w-4 animate-bounce" />
          </a>
        </section>

        {/* Rotating line + product shot */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="display reveal text-center text-4xl text-foreground sm:text-6xl">
            AI can coach your{' '}
            <span className="word-cycle accent-text">
              <span>
                <span>opener.</span>
                <span>discovery.</span>
                <span>objections.</span>
                <span>close.</span>
                <span>opener.</span>
              </span>
            </span>
          </h2>
          <p className="reveal mx-auto mt-5 max-w-2xl text-center font-light text-muted-foreground">
            One live room. The buyer reply types out on every screen at once, the coach reads it, and the manager decides
            what happens next.
          </p>
          <CallMock />
        </section>

        {/* Three seats */}
        <section id="seats" className="mx-auto max-w-6xl px-6 py-24">
          <div className="reveal text-center">
            <span className="chip">Three seats, one room</span>
            <h2 className="display mt-5 text-4xl text-foreground sm:text-6xl">
              Sell together. <span className="accent-text">Live.</span>
            </h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {SEATS.map((s) => (
              <div key={s.seat} className="glass reveal rounded-2xl p-6">
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-primary">{s.seat}</div>
                <div className="mt-3 text-lg font-medium text-foreground">{s.line}</div>
                <p className="mt-2 text-sm font-light leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Terminal */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="reveal text-center">
            <h2 className="display text-4xl text-foreground sm:text-6xl">
              Paste a URL. <span className="accent-text">Thirty seconds.</span>
            </h2>
            <p className="mono mt-4 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Every call starts this way</p>
          </div>
          <div className="glass reveal mx-auto mt-10 max-w-xl overflow-hidden rounded-xl">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <span className="mono ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">discovery dojo</span>
            </div>
            <div className="mono space-y-1.5 p-5 text-[13px]">
              <div className="type-in text-foreground" style={delay(0.2)}>$ start call gong.io</div>
              <div className="type-in text-muted-foreground" style={delay(0.9)}>{'>'} firecrawl: reading gong.io</div>
              <div className="type-in text-muted-foreground" style={delay(1.6)}>{'>'} exa: 5 web results, 5 news stories</div>
              <div className="type-in text-muted-foreground" style={delay(2.3)}>{'>'} claude: building a buyer with hidden pains</div>
              <div className="type-in text-muted-foreground" style={delay(3.0)}>{'>'} coach: 3 openers ready</div>
              <div className="type-in text-emerald-400" style={delay(3.7)}>
                <span className="caret">ok, you are live with the VP of Revenue Operations</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, body]) => (
              <div key={title} className="reveal bg-background/90 p-7">
                <Sparkle className="h-3 w-3 text-primary" />
                <div className="mt-4 font-medium text-foreground">{title}</div>
                <p className="mt-2 text-sm font-light leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Ticker */}
        <div className="overflow-hidden border-y border-border bg-background/60 py-3">
          <div className="marquee mono text-[11px] tracking-[0.2em] text-muted-foreground">
            <span className="pr-4">{TICKER.repeat(3)}</span>
            <span className="pr-4">{TICKER.repeat(3)}</span>
          </div>
        </div>

        {/* Built on DeepSpace */}
        <section id="built" className="mx-auto max-w-6xl px-6 py-24">
          <div className="reveal text-center">
            <span className="chip">
              <Sparkle className="h-2.5 w-2.5" /> Built on DeepSpace
            </span>
            <h2 className="display mt-5 text-4xl text-foreground sm:text-6xl">
              Sync, presence, AI. <span className="accent-text">Already there.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl font-light text-muted-foreground">
              No vendor keys in the code, no socket server, no auth to write. The platform does the plumbing; the app is
              the sales logic.
            </p>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRIMITIVES.map(([name, what]) => (
              <div key={name} className="glass reveal rounded-xl p-4">
                <div className="mono text-xs text-primary">{name}</div>
                <div className="mt-1.5 text-sm font-light text-muted-foreground">{what}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Roadmap */}
        <section id="next" className="mx-auto max-w-6xl px-6 py-24">
          <div className="reveal text-center">
            <span className="chip">From practice room to sales engine</span>
            <h2 className="display mt-5 text-4xl text-foreground sm:text-6xl">Practice the call. Then win the real one.</h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              ['Today', 'Practice room', 'An AI buyer built from a real prospect, with the live coach and your manager on the call.'],
              ['Next', 'Live assist', 'The same coach, notes and manager seat beside a conversation with a real buyer.'],
              ['Then', 'Voice, video, CRM', 'Calls over voice and video, and outcomes written straight to your CRM.'],
            ].map(([when, what, body], i) => (
              <li key={when} className="glass reveal relative rounded-2xl p-6">
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">0{i + 1} / {when}</div>
                <div className="mt-3 text-xl font-light text-foreground">{what}</div>
                <p className="mt-2 text-sm font-light text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Final call to action */}
        <section className="flex flex-col items-center px-6 py-28 text-center">
          <Sparkle className="h-6 w-6 text-foreground" />
          <h2 className="display reveal mt-6 text-5xl text-foreground sm:text-7xl">Your next call starts here.</h2>
          <Link to="/home" className="btn-glow mt-10 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background">
            Enter the dojo <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <footer className="border-t border-border/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-8 text-xs text-muted-foreground">
            <span className="flex items-center gap-2 text-foreground">
              <Sparkle className="h-3 w-3" /> Discovery Dojo
            </span>
            <span>Built on DeepSpace by Aditya Vikram Reddy Vennapusala</span>
            <div className="flex-1" />
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-foreground">GitHub</a>
            <a href="https://docs.deep.space" target="_blank" rel="noreferrer" className="hover:text-foreground">DeepSpace docs</a>
          </div>
        </footer>
      </div>
    </>
  )
}

/** A static, animated picture of a live call: the product in one glance. */
function CallMock() {
  return (
    <div className="float-slow reveal mx-auto mt-14 max-w-5xl">
      <div className="glass overflow-hidden rounded-2xl shadow-[0_40px_120px_-40px_rgba(120,110,255,0.45)]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3 text-xs">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          <span className="ml-2 font-medium text-foreground">Gong</span>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live
          </span>
          <span className="ml-auto hidden gap-2 sm:flex">
            <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">Rep</span>
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-300">Manager</span>
          </span>
        </div>
        <div className="grid md:grid-cols-[1fr_300px]">
          <div className="space-y-4 p-5 text-left text-[13px]">
            <div className="type-in ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground" style={delay(0.3)}>
              Saw you doubled the SDR team this year. What has that done to your pipeline reviews?
            </div>
            <div className="type-in max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-foreground" style={delay(1.2)}>
              Honestly? Half of every review is arguing about whether the data is even current. What is your angle?
            </div>
            <div className="type-in max-w-[80%] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200" style={delay(2.0)}>
              <b className="text-amber-300">Manager:</b> do not pitch yet, put a number on that pain
            </div>
            <div className="type-in ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground" style={delay(2.8)}>
              What does a bad week of stale data cost you in missed meetings?
            </div>
          </div>
          <div className="border-t border-border p-5 text-left md:border-l md:border-t-0">
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-primary">Live coach</div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-3xl font-light text-emerald-400">68</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">deal temperature</div>
              </div>
              <svg width="96" height="28" viewBox="0 0 96 28" aria-hidden className="text-primary">
                <polyline points="0,22 24,18 48,20 72,10 96,6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <span className="mt-3 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-400">Buying signal</span>
            <div className="mt-4 space-y-2 text-xs">
              {['Quantify the pain', 'Find the economic buyer', 'Ask for next step'].map((t, i) => (
                <div
                  key={t}
                  className={`type-in rounded-lg border p-2.5 ${i === 0 ? 'border-amber-500/50 bg-amber-500/10' : 'border-border'}`}
                  style={delay(1.6 + i * 0.3)}
                >
                  <div className="flex justify-between font-medium text-foreground">
                    {t}
                    {i === 0 && <span className="text-[10px] text-amber-300">Manager recommends</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 text-[11px] text-muted-foreground">
              {['Metrics', 'Economic buyer', 'Identify pain'].map((m, i) => (
                <div key={m} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full border ${i === 2 ? 'border-emerald-400 bg-emerald-400/30' : 'border-border'}`} />
                  {m}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
