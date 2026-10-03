# Demo Legal — Attorney Performance Management System (PMS)

A 360°, institution-wide performance management platform for a professional-services
(legal) firm. Attorneys **launch** a review cycle; managers, peers, subordinates,
clients and the attorney themselves contribute feedback; managers draft, finalize and
approve reports; quarterly approved reports roll up into an end-of-year report.

Built by the AI development team as a reviewable, runnable v1.

---

## Stack

| Layer    | Tech                                            |
|----------|-------------------------------------------------|
| Frontend | React 18 + Vite + React Router                  |
| Backend  | Node.js + Express                               |
| Database | PostgreSQL (via Prisma ORM)                     |
| Auth     | JWT (access tokens) + bcrypt password hashing   |
| AI       | Anthropic Claude (optional, server-side)        |
| PDF      | `@react-pdf/renderer` (client-side export)      |

```
mostoeneng-pms/
├─ backend/         Express API + Prisma schema + seed
├─ frontend/        React + Vite SPA
├─ docker-compose.yml   Postgres for local dev
└─ docs/            Architecture, data model, cadence rationale
```

---

## Quick start

This is Kone Tshivhinda's public development snapshot. Demonstration identities use example.test addresses; no live firm database is included.

Before seeding, set ALLOW_DEMO_SEED=true and SEED_PASSWORD to a newly generated value of at least 12 characters in backend/.env. Keep JWT_SECRET independently random. Seeds reset database tables and refuse to run in production. Login passwords are entered manually, never prefilled.


You need **Node 18+** and **Docker** (for Postgres). If you already run Postgres
locally, skip Docker and just point `DATABASE_URL` at your instance.

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # configure DATABASE_URL and JWT_SECRET before starting
# Generate a signing key, then paste it into JWT_SECRET in .env:
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# (optional) enable AI: set ANTHROPIC_API_KEY in .env. Without a key the app
# runs normally and AI features show an "AI not configured" state.
npm install
npm run db:push               # create tables from schema
npm run db:seed               # resets tables; use a disposable demonstration database
npm run dev                   # API on http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # app on http://localhost:5173
```

Open http://localhost:5173 and log in with one of the seeded accounts below.

The API refuses to start when `JWT_SECRET` is missing or shorter than 32
non-padding characters. Copying the example configuration alone is insufficient.
Use a new random secret for each environment. Tokens use HS256; changing the
secret invalidates existing sessions.

### Automated checks

Run `npm test` in `backend/` for the authentication tests and `npm run build`
in `frontend/` for the bundle check. GitHub Actions runs both on pull requests
and pushes to `main`. Authentication tests use synthetic identities and keys;
they do not exercise PostgreSQL, review workflows, or live AI providers.

---

## Seeded logins (password for all: `SEED_PASSWORD (configured locally)`)

| Role      | Email                          | What they see                              |
|-----------|--------------------------------|--------------------------------------------|
| Admin     | admin@example.test            | Everything + cycle management              |
| Manager   | t.dlamini@example.test        | Team dashboard, draft/approve reports      |
| Attorney  | n.khumalo@example.test        | Own dashboard, launch button, self-review  |
| Attorney  | s.naidoo@example.test         | Own dashboard (mid-cycle, partial feedback)|
| Client    | client@client.example.test       | Client portal: feedback they owe           |

---

## The "launch button" model

An attorney opens a review by pressing **Launch Review**. At that instant the system:

1. stamps `launchedAt`,
2. creates 360° feedback requests (manager, peers, subordinates, client, self),
3. begins tracking **elapsed time** and **completion rate** against the firm's cadence SLA.

Everything downstream — reminders, completion %, cycle-time analytics — is measured
from that timestamp. See `docs/CADENCE.md` for the industry-standard cadence we adopted.

---

## Report lifecycle

```
DRAFT ──submit──▶ IN_REVIEW ──finalize──▶ FINALIZED ──approve──▶ APPROVED
  ▲                                                                  │
  └────────────────────── (manager can send back) ◀─────────────────┘
```

Approved quarterly reports are immutable and feed the **annual rollup**.

---

## AI features (optional)

Set `ANTHROPIC_API_KEY` in `backend/.env` to enable the intelligence layer. All AI
runs server-side; the key never reaches the browser. Configure via:

```
AI_ENABLED="true"              # master switch — set "false" to disable entirely
ANTHROPIC_API_KEY="sk-ant-..." # your key
AI_MODEL="claude-opus-4-8"     # or claude-sonnet-4-6 / claude-haiku-4-5 for lower cost
```

- **Review Organizer** — restructures messy free-text feedback into clear strengths /
  improvement bullets + themes.
- **Bias & Quality Check** — flags vague, non-actionable, or potentially biased wording
  before feedback is submitted (advisory; never blocks).
- **Report Draft Assistant** — drafts the manager's narrative from the 360 feedback +
  the attorney's memory; the manager always edits and approves.
- **Attorney Memory** — a persistent profile refreshed when a report is approved, feeding
  the draft assistant so reviews build on history.

Every AI output is labelled "AI-assisted," editable, and never auto-finalized. Each call
is logged to the `AiRun` table for cost/audit transparency.

> **⚠️ Privacy / POPIA.** AI features transmit review free-text to the Anthropic API.
> Anthropic does not train on API inputs by default, but performance data is sensitive
> personal information. Confirm with your HR/privacy owner before enabling in production;
> use `AI_ENABLED="false"` to ship without it.

## PDF export

Branded, letterhead-styled PDFs are generated client-side: approved review reports,
the annual rollup, client feedback summaries, and a manager team snapshot. Look for the
**Download PDF** buttons on the relevant screens.

## Notifications

In-app notifications fire when feedback is requested (on launch) and when a review changes
state; managers also see an SLA nudge banner for overdue reviews. The bell in the top bar
shows unread count.

## Home overview & widgets

A Zoho-style overview greets each user: a time-of-day greeting card with a daily quote and
live office weather, a "This week" schedule strip marking weekends and public holidays, a
recent-activity feed, and generated avatars throughout. These use free public APIs
(ZenQuotes, Open-Meteo, Nager.Date, DiceBear) — but for POPIA safety:

- Quote/weather/holidays are **proxied server-side** (`/api/widgets/*`), cached, and degrade
  gracefully if an upstream is down — third parties never see individual users.
- Avatar seeds are **SHA-256-hashed** before reaching DiceBear, so no name/id is transmitted.

Configure the office location and holiday country in `backend/.env`:

```
HOLIDAY_COUNTRY="ZA"           # ISO country code (Nager.Date)
OFFICE_LAT="-26.2041"          # weather location (Open-Meteo) — default Johannesburg
OFFICE_LON="28.0473"
```

The top bar also shows an **AI status chip** indicating whether AI is active and which model.

---

See `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` for the full design.
