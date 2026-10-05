# Discovery Dojo

A multiplayer AI sales room, built on [DeepSpace](https://docs.deep.space).

Paste a prospect's website. Discovery Dojo researches the company, builds a buyer with real pains and objections, and puts a rep on a live call. An AI coach reads every buyer reply and suggests the next move. A manager can join the same room, recommend a move, pin coaching notes, or step into the call to close. When the call ends, it is scored on MEDDIC with a deal outcome, and lands on a live team leaderboard.

It is a practice room today. The same coach and manager tools are designed to sit beside real calls next, with voice and video.

**Live app:** https://discovery-dojo.app.space

## What happens in a call

1. **Research.** Firecrawl scrapes the homepage, Exa finds web and news results, and Claude turns it into a buyer persona. The public half (name, title, pre-call brief) goes on the session. The hidden half (pains, objections, MEDDIC truth) goes into a collection no rep can read.
2. **Open.** The rep speaks first. The coach offers three openers built from public research only.
3. **Talk.** Each buyer reply streams into a shared record, so the rep and every manager watch it type out at the same time.
4. **Coach.** After every reply, the coach writes an insight: buyer signal, deal temperature, MEDDIC coverage and three next moves. The manager can recommend one, which lights up on the rep's screen, or step in and talk to the buyer directly.
5. **Close and review.** The buyer can be won: it agrees to a next meeting, a pilot or a purchase when the rep earns it. Scoring returns six MEDDIC scores with evidence, pains found and missed, turnarounds, and the deal outcome.

## DeepSpace pieces used

| Piece | Used for |
| --- | --- |
| `RecordRoom` + `useQuery` / `useMutations` | Sessions, transcript, coaching notes, live insights, leaderboard. Every write reaches every open browser |
| Collection RBAC (`src/schemas/dojo-schemas.ts`) | Hidden personas no member can read; server-write-only transcript and insights; notes members can only edit if they wrote them |
| Server actions (`src/actions/dojo.ts`) | All privileged work, with an explicit "is this the rep?" check in each one |
| `usePresenceRoom` | Who is in the room and who is typing. Ephemeral, never stored |
| AI proxy (`createDeepSpaceAI`) | Claude for persona, buyer, coach and scoring, with a fallback chain to OpenAI and Cerebras |
| Integrations proxy (`tools.integration`) | `firecrawl/scrape`, `exa/search`, `exa/news-search` |
| R2 files (`useR2Files`) | Attachments shared on the call. The buyer reads text files |
| Auth (`DeepSpaceAuthProvider`, `AuthGate`) | Google sign-in; role per call comes from the session, not the account |

No vendor API keys live in this repo. Every model and integration call goes through DeepSpace and is billed to the app owner.

## Patterns worth copying

These are the parts I would point another DeepSpace developer to.

**Stream AI output through a record, not an HTTP stream.** `dojo-send-turn` creates an empty buyer turn, then calls `tools.update` with the growing text every 250 ms. RecordRoom fans each update out over the WebSocket every client already has, so a manager watching sees the same stream as the rep. One channel, no extra plumbing. Trade-off: about four writes a second during a reply, which is why it is throttled rather than per token.

**Keep secrets in a collection, not on the row.** If the buyer's hidden pains were a field on the session, the rep could read them from the WebSocket payload in devtools. `personas` has `read: false` for members, so the rep's browser never receives them. Managers get them through `dojo-reveal-persona`, which checks the role.

**Server actions are the auth boundary.** Action `tools` run with record permissions off. Every action reloads the session and checks `session.repId` against the verified caller before doing anything.

**Facts from the session, not from presence.** Presence state is self-reported and can be lost before the socket connects. The rep/manager label is derived from `session.repId`, and presence only carries ephemeral things like typing.

**Compute the numbers in code.** The model returns six sub-scores; code clamps them and computes the total and talk ratio, and strips em and en dashes from every model string (`tidy` in `src/server/dojo/ai.ts`).

**Degrade, never die.** Every research source is optional (Firecrawl falls back to a plain fetch), and every model call walks a fallback chain on 402, 429 or 5xx.

## Project map

```
src/schemas/dojo-schemas.ts   collections and RBAC
src/dojo/types.ts             types shared by worker and browser
src/actions/dojo.ts           server actions: create, prepare, send-turn, analyze,
                              pick-suggestion, end-call, reveal-persona, delete
src/server/dojo/research.ts   Firecrawl + Exa research
src/server/dojo/prompts.ts    persona, buyer, opener, coach and scoring prompts
src/server/dojo/ai.ts         model fallback chains, JSON extraction, tidy()
src/pages/(app)/home.tsx      start a call, see live calls
src/pages/(app)/(protected)/call/[id].tsx   the call room
src/components/dojo/          LivePanel, Composer, TurnItem, Scorecard, badges
src/pages/(app)/(protected)/leaderboard.tsx live rankings
```

## Run it

```bash
npm install
npx deepspace auth login
npx deepspace dev start      # http://localhost:5173
npx tsc --noEmit && npx eslint src
npx deepspace deploy
```

## Trade-offs and what I left out

- **Text, not voice.** Text keeps the demo fast to judge and cheap to run, and every coach and scoring feature works on the transcript. Voice (`useVoiceAgent`) and video (LiveKit rooms) are the next step, on the same records.
- **Owner-billed, with a cap.** Anyone who signs in can try it without credits; each user is limited to 8 new calls a day.
- **Long research runs in one request.** It takes 20 to 40 seconds and the room shows live progress from the session status. A closed tab can cut it off; moving it to a DeepSpace background job is the fix.
- **One room for the whole app.** Fine for a team. At scale I would scope records per team or per call.
- **No CRM sync yet.** Deal outcomes stay in the app; pushing them to a CRM is the obvious next integration.
