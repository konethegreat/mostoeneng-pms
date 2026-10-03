# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Demo Legal PMS — a 360°, institution-wide **performance management system** for a
professional-services (legal) firm. An attorney **launches** a quarterly review cycle;
managers, peers, subordinates, a client and the attorney themselves submit feedback;
managers draft → finalize → approve a report; approved quarterly reports roll up into an
annual report. This is a reviewable, runnable v1 (see `docs/ARCHITECTURE.md` for the
production-hardening punch list that is deliberately out of scope).

## Repo layout

Two independently runnable apps plus a database. They communicate **only** over the
`/api/*` HTTP surface, so either side can be changed in isolation.

```
backend/    Express API + Prisma schema + seed   → see backend/CLAUDE.md
frontend/   React + Vite SPA                      → see frontend/CLAUDE.md
docs/       ARCHITECTURE, DATA_MODEL, CADENCE, HOSTING_AND_SCALING, ui mockups
docker-compose.yml   Optional Postgres for local dev (HANDOVER notes it is NOT used —
                     dev uses a local Postgres `mostoeneng_pms` DB via pgAdmin4)
```

## Run order (full stack, from a clean checkout)

```bash
# 1. (optional) Postgres via Docker — or point DATABASE_URL at a local instance
docker compose up -d

# 2. Backend  →  API on http://localhost:4000
cd backend
cp .env.example .env          # then set a real DATABASE_URL / JWT_SECRET
npm install
npm run db:push               # create tables from prisma/schema.prisma
npm run db:seed               # load the seeded firm + Q1 approved + Q2 in-flight
npm run dev

# 3. Frontend (new terminal)  →  SPA on http://localhost:5173 (proxies /api → :4000)
cd frontend
npm install
npm run dev
```

Seeded logins, password `SEED_PASSWORD (configured locally)` for all:
`admin@example.test` (ADMIN), `t.dlamini@example.test` (MANAGER),
`n.khumalo@example.test` (ATTORNEY), `s.naidoo@example.test` (ATTORNEY, mid-cycle),
`client@client.example.test` (CLIENT).

## Core domain model (the big picture)

- **Roles:** `ADMIN`, `MANAGER`, `ATTORNEY`, `CLIENT`. The 360 feedback *sources* are a
  separate enum: `SELF`, `MANAGER`, `PEER`, `SUBORDINATE`, `CLIENT`.
- **Review lifecycle:** `NOT_STARTED → LAUNCHED → DRAFT → IN_REVIEW → FINALIZED → APPROVED`.
  A manager can `send-back` (→ `DRAFT`) any time before `APPROVED`. Approved reports are
  immutable and feed the annual rollup.
- **The "launch button":** an attorney pressing launch (`POST /api/reviews/launch`) is the
  spine of the whole system. It stamps `launchedAt`, fans out one `FeedbackRequest` per 360
  source, and anchors **all** SLA / completion-rate / cycle-time analytics. Treat
  `launchedAt` as load-bearing — analytics in `backend/src/lib/scoring.js` measure from it.
- **Scoring:** composite score = weighted mean of every rating, weight =
  `competency.weight × response.sourceWeight`. Source weights: Manager 1.5, Client 0.9,
  Peer 1.0, Subordinate 1.0, Self 0.8. This encodes two firm policies (which competencies
  matter, which voices matter) in one number.
- **Annual rollup:** an `ANNUAL` `ReviewCycle` is the parent of four quarterly `children`;
  `GET /api/dashboard/rollup/:attorneyId/:annualCycleId` averages the approved quarters.
- **Audit:** every state transition writes a `ReportEvent` (immutable trail).

## Cross-cutting conventions

- **Visibility rule (enforced server-side):** an attorney does **not** see their own scores,
  competency breakdown, or final summary until the report is `APPROVED`. Don't surface
  mid-cycle scores in the attorney UI/API.
- **Auth:** JWT bearer tokens, 8h expiry, stored in `localStorage`. There are no refresh
  tokens or revocation — by design for v1.
- **Schema changes use `prisma db push`, not `prisma migrate`.** There is no migration
  history. After editing `backend/prisma/schema.prisma`, run `npm run db:push` (or
  `npm run db:reset` to wipe + reseed). Adopt `prisma migrate` only if asked.
- **Authentication tests:** run `npm test` in backend (no database or provider calls).
  These cover signing configuration, JWT verification and role gates. Other
  verification remains `node --check` on backend files, the Vite
  bundle building cleanly, and a live smoke: boot the backend, log in as a seeded user
  (e.g. `t.dlamini@example.test` / `SEED_PASSWORD (configured locally)`) for a JWT, then `curl` the endpoint
  (the local DB is seeded). For import-resolution use
  `node --input-type=module -e "await import('./src/routes/x.js')"`. Do not claim a
  database-backed workflow was verified from the authentication tests alone.
- **Windows dev gotcha:** the backend binds `:4000` and only one instance can. Git Bash
  `kill`/`pkill` do **not** reliably stop a backgrounded `node` on Windows (this caused
  `EADDRINUSE` for the user). Free the port with PowerShell:
  `Get-NetTCPConnection -LocalPort 4000 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`.
- **Secrets:** `.env` files are gitignored (see `.gitignore`, hardened to exclude all
  `.env*` except `.env.example`). Never commit real `DATABASE_URL` / `JWT_SECRET`.

## AI layer & newer capabilities

- **AI is optional and server-side.** `backend/src/lib/ai/*` calls the Anthropic SDK;
  `aiEnabled()` gates everything on `AI_ENABLED !== "false"` + `ANTHROPIC_API_KEY`. When off,
  AI routes return `{ aiEnabled: false }` (HTTP 200) and the UI degrades — never assume AI is
  available. Default model `claude-opus-4-8`, override via `AI_MODEL`. Key lives in
  `backend/.env` (gitignored) and must never reach the frontend.
- **Features:** Review Organizer, Bias & Quality Check, Report Draft Assistant, Attorney
  Memory (auto-refreshed on `APPROVED`). All outputs are AI-labelled, editable, never
  auto-finalized; every call writes an `AiRun` audit row.
- **Privacy/POPIA:** AI sends review text to Anthropic. Documented in README/ARCHITECTURE;
  `AI_ENABLED="false"` ships it off.
- **Notifications:** `Notification` rows written by `backend/src/lib/notify.js` on launch +
  state changes; surfaced via the top-bar bell and an SLA nudge banner. In-app only.
- **PDF export:** client-side `@react-pdf/renderer` in `frontend/src/pdf/` (review, annual,
  client, team-snapshot) on the "Counsel" letterhead; `download.js` triggers on click.

## Where to read more

`docs/DATA_MODEL.md` (entity rationale), `docs/CADENCE.md` (launch/SLA rules),
`docs/ARCHITECTURE.md` (layers, auth, hardening list), `HANDOVER.md` (decisions + open
questions). When changing review-state or scoring logic, re-read CADENCE + DATA_MODEL first.
