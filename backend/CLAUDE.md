# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend for Demo Legal PMS. See the root `../CLAUDE.md` for the domain model (roles,
review lifecycle, launch button, scoring weights, annual rollup). This file covers the
API layer specifically.

## Stack & commands

Use Node 22.12 or newer. CI runs authentication tests and rejects moderate or
higher dependency audit findings.

Node.js + Express (ESM — `"type": "module"`, use `import`), Prisma ORM, PostgreSQL, JWT
auth (`jsonwebtoken`), `bcryptjs`, `zod` (available; validation is mostly hand-rolled).

```bash
npm run dev        # node --watch src/server.js  → http://localhost:4000
npm run start      # production start (no watch)
npm run db:push    # apply prisma/schema.prisma to the DB (NO migration history)
npm run db:seed    # node prisma/seed.js — wipes & reseeds the firm
npm run db:reset   # prisma db push --force-reset && reseed (nuke everything)
npm run db:studio  # Prisma Studio GUI
```

Run `npm test` for synthetic authentication and role-gate tests. On a disposable
seeded PostgreSQL database, `npm run test:directory` checks directory access for
all four roles, including another manager's team. CI supplies an isolated database
for these checks. `npm run test:workflow` needs Docker: through `../scripts/demo-runtime.mjs`
it starts a labelled throwaway PostgreSQL 16 container, pushes the schema, seeds, runs
`src/server.js` on loopback with AI and widget APIs off, and walks the quarterly review
over real HTTP (26 results). It ignores the caller's `DATABASE_URL`. There is no lint step.
To smoke-check syntax: `node --check src/**/*.js`.
`JWT_SECRET` is required and must contain at least 32 characters after trimming;
generate a random value instead of copying a shared development secret.
Health check: `GET /api/health`.

## Layout & layering

```
src/server.js              Express app: CORS, JSON, morgan, mounts /api/* routers, error handler
src/middleware/auth.js     signToken, requireAuth (verifies Bearer JWT → req.user), requireRole(...)
src/routes/*.js            HTTP handlers + validation + authorization (auth, users, cycles,
                           reviews, feedback, dashboard)
src/lib/scoring.js         Pure functions: computeOverallScore, competencyBreakdown,
                           bySourceBreakdown, completionRate, cycleTime
src/lib/http.js            asyncRoute (rejections → error handler), textProblem, LIMITS
src/lib/prisma.js          Singleton PrismaClient
prisma/schema.prisma       The full relational model (read this first for any data change)
prisma/seed.js             8-competency framework + group + users + Q1 APPROVED + Q2 in-flight
```

`reviews.js` is the heart of the system and worth reading in full before touching review
flow — it owns `launch`, the `transition()` factory (submit/finalize/approve), `send-back`,
`build360()`, and `refreshScore()`.

## Authorization is two-layered — preserve both

The people and practice-group directories are internal-only. Clients can read the
competency framework for feedback, but cannot list staff or group contacts.
Attorneys receive colleague identifiers and names only; managers retain their
direct-report scope and admins retain their active-directory view.

1. **Route gate:** `requireAuth` on every protected route; `requireRole(...)` on
   privileged ones (e.g. only ADMIN creates cycles; only MANAGER/ADMIN draft/transition).
2. **Row-level checks inside handlers**, which the role gate does NOT cover:
   - Only the owning manager or an ADMIN may draft, submit, finalize, approve or send
     back a review, and never its subject (`managesReview()` in `reviews.js`). This
     includes `send-back`, which once had no ownership check.
   - `GET /api/reviews/:id` has three views. Owning manager/admin: everything. The
     subject: no drafts ever, and no `overallScore`/`finalSummary`/`analytics` until
     `APPROVED`; reviewers listed by name only. Any other reviewer: a skeleton with only
     their own request and no events, goals, scores or narratives. The list endpoint and
     `dashboard.js` `/attorney` hide the subject's scores the same way.
   - `/dashboard/rollup/:attorneyId/:annualCycleId`: the attorney, an admin, their line
     manager or a manager owning one of their reviews (`canSeeRollup()`); other managers
     get 403.
   - Feedback is accepted only while the review is `LAUNCHED`, `DRAFT` or `IN_REVIEW`
     (`open` on `/feedback/mine` and `/feedback/request/:id`); finalizing closes it and
     send-back reopens it. Submissions are validated (whole-number scores 1-5, distinct
     active competencies, text limits) and replaced inside one transaction.

When adding endpoints that expose review or feedback data, replicate this pattern — a
role gate alone is not sufficient.

## AI & notifications layer

```
src/lib/ai/client.js        aiEnabled(), model(), client() (lazy Anthropic), logRun() → AiRun
src/lib/ai/organizeFeedback.js  structured output (zodOutputFormat) → strengths/improvements/themes
src/lib/ai/biasCheck.js     structured output → flags + specificityScore (advisory)
src/lib/ai/draftReport.js   streamed narrative (adaptive thinking) → manager draft
src/lib/ai/memory.js        refreshAttorneyMemory(attorneyId) — longitudinal profile
src/routes/ai.js            /status, /organize/:id, /bias-check, /reviews/:id/draft, /attorneys/:id/memory[/refresh]
src/lib/notify.js           notify()/notifyMany() → Notification rows (best-effort)
src/routes/notifications.js GET /, POST /:id/read, POST /read-all
src/routes/widgets.js       GET /greeting (quote+weather), /holidays — server-side proxy of free
                            public APIs (ZenQuotes/Open-Meteo/Nager.Date), in-memory cached, resilient
src/routes/activity.js      GET / — role-scoped recent ReportEvents (clients: their notifications)
```

- **External APIs are proxied, not called from the browser** (POPIA): widgets cache results and
  fall back gracefully. Office location / holiday country come from `OFFICE_LAT/OFFICE_LON/HOLIDAY_COUNTRY`.

- **Graceful-fallback contract:** every AI route returns `{ aiEnabled: false }` (200) when
  `aiEnabled()` is false — do not throw. Replicate this in any new AI endpoint.
- **SDK specifics (v0.104.x):** structured output uses `import { zodOutputFormat } from
  "@anthropic-ai/sdk/helpers/zod"` (single arg), `client.messages.parse({ output_config:
  { format: zodOutputFormat(Schema) } })`, result on `res.parsed_output`. Drafting uses
  `client.messages.stream(...).finalMessage()`. Default model `claude-opus-4-8`.
- **⚠️ Zod must be v4 for the SDK helper:** schemas MUST be `import { z } from "zod/v4"`,
  NOT `"zod"`. Installed `zod` is 3.25.x (ships a `/v4` subpath); the SDK helper does
  `require("zod/v4")` and needs v4 schemas — importing from `"zod"` gives v3 schemas and
  **crashes the process** on the AI call (`schema._zod` undefined). This already bit us once.
- **AI routes must not crash the server.** Handlers in `ai.js` are wrapped in `safe()` and
  `server.js` has an `unhandledRejection` guard — Express 4 does NOT catch async rejections,
  so an unguarded AI/network throw kills the whole API (and cascades to ECONNREFUSED on every
  other route). Wrap any new AI route the same way.
- **Live AI calls hit the real `ANTHROPIC_API_KEY` in `.env` (costs money).** Develop against
  the `{ aiEnabled:false }` fallback and smoke real calls sparingly.
- **Authorization:** AI routes keep the two-layer model. Memory refresh is scoped to ADMIN
  or the attorney's owning manager (not any manager) — see the IDOR fix.
- **Approve hook:** the `transition()` factory dynamically imports `memory.js` and fires
  `refreshAttorneyMemory` after `APPROVED` (best-effort `.catch`), so approval never depends
  on AI. It also notifies the subject; `launch` notifies reviewers.
- **New models/fields:** `AttorneyMemory`, `Notification`, `AiRun`; `FeedbackResponse.organized`
  (JSON string, cleared on resubmit), `PerformanceReview.aiDraftSummary`.

## Things that will bite you

- **`prisma db push`, not migrations.** No `prisma/migrations/` history exists. Edit
  `schema.prisma` then `npm run db:push`; use `db:reset` when the schema diverges.
- **Source weights live in two places.** Composite-score source weights are applied at
  *submit* time in `routes/feedback.js` (`SOURCE_WEIGHT`) and persisted onto
  `FeedbackResponse.sourceWeight`; `lib/scoring.js` then reads that stored value. Changing
  the policy means changing the map AND re-submitting/reseeding to repersist it.
- **Score is denormalized.** `PerformanceReview.overallScore` is a cached value written by
  `refreshScore()` on draft-save and finalize — it is not recomputed on every read. If you
  change scoring math, call `refreshScore()` (or reseed) or stored scores go stale.
- **`build360()` reviewer selection is heuristic/demo-grade:** self, manager, up to 3 peers
  who share the practice group *and* manager (so direct reports are asked only once, as
  subordinates), up to 3 subordinates, and the *first active client* (real
  client↔attorney matching needs matter data). Launch requires an open `QUARTERLY` cycle
  and a `managerId`; annual results come from the rollup.
- **Express 4 does not catch async rejections.** Wrap new handlers in `asyncRoute()`
  (`src/lib/http.js`) so a database error reaches the error handler instead of leaving
  the request hanging. Validate input first and answer 400/409 explicitly.
- **Uniqueness constraints** to respect: one review per `(subjectId, cycleId)`; one request
  per `(reviewId, reviewerId, reviewerRole)`; one rating per `(responseId, competencyId)`.
  `launch` and feedback-submit use `upsert`/replace to stay idempotent.
- **Env:** `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CLIENT_ORIGIN`
  (see `.env.example`). Optional `HOST` binds one interface (the demo uses `127.0.0.1`);
  `EXTERNAL_WIDGETS_ENABLED="false"` stops the quote/weather/holiday upstream calls.
  `/api/health` reports `aiEnabled` and `externalWidgets`. `.env` is gitignored; never
  commit it.
