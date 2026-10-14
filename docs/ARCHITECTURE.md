# Architecture

## Overview

```
┌──────────────┐     HTTPS/JSON      ┌──────────────────┐     SQL      ┌────────────┐
│  React SPA   │ ───────────────────▶│  Express API     │ ────────────▶│ PostgreSQL │
│  (Vite)      │   Bearer JWT         │  (Prisma ORM)    │   Prisma     │            │
└──────────────┘                      └──────────────────┘              └────────────┘
   dashboards                            auth · routes ·                  relational
   role-based UI                         scoring · audit                  model
```

Two independently runnable apps plus a database. The frontend talks to the backend
only through the `/api/*` HTTP surface, so either side can be swapped or deployed
separately.

## Backend layers

| Layer        | Files                         | Responsibility                                  |
|--------------|-------------------------------|-------------------------------------------------|
| Entry        | `src/server.js`               | Express app, CORS, JSON, route mounting         |
| Auth         | `src/middleware/auth.js`      | JWT sign/verify, `requireAuth`, `requireRole`   |
| Routes       | `src/routes/*.js`             | HTTP handlers, validation, authorization checks |
| Domain logic | `src/lib/scoring.js`          | Weighted scoring, completion rate, cycle time   |
| AI           | `src/lib/ai/*` + `routes/ai.js` | Anthropic-backed organizer, bias check, draft, memory |
| Notifications| `src/lib/notify.js` + `routes/notifications.js` | In-app notification writes + read state |
| Data         | `src/lib/prisma.js` + schema  | Prisma client + the relational model            |

## Authorization model

Every protected route runs `requireAuth` (validates the JWT) and the sensitive ones
add `requireRole(...)`. Beyond role gates, the reviews routes do **row-level** checks:

- Only the owning manager or an admin can draft, submit, finalize, approve or send back
  a review, and never the attorney it is about.
- An `ATTORNEY` only sees reviews where they are the subject — scores, the breakdown and
  the final summary stay hidden until the report is `APPROVED`, and drafts always.
- A reviewer (peer/client/subordinate) can open a review skeleton holding only their own
  request: no scores, narratives, other reviewers or history.
- The annual rollup is limited to the attorney, admins, the attorney's line manager and
  managers who own one of their reviews.

`npm run test:workflow` exercises these rules over real HTTP with fictional accounts, and
`docs/DEMO.md` walks through them in the browser.

## Key flows

### Launch (the "launch button")
`POST /api/reviews/launch { cycleId }`
1. Requires an open `QUARTERLY` cycle (annual results are the rollup) and a reviewing
   manager (`managerId`), then finds/creates the attorney's `PerformanceReview`.
2. Builds the 360 reviewer list (`build360`): self, manager, up to 3 peers who share the
   practice group and manager, up to 3 direct reports (asked once, as subordinates), and
   a client.
3. Creates one `FeedbackRequest` per reviewer.
4. Stamps `launchedAt` and sets status `LAUNCHED`, then writes a `ReportEvent`.

### Feedback collection
Each reviewer submits via `POST /api/feedback/request/:id` — a set of whole-number 1–5
ratings across distinct active competencies plus free-text strengths/improvements.
Feedback is open from launch until the report is finalized. A resubmission replaces the
earlier response in one transaction. On submit, the request flips to `SUBMITTED`, which
moves the completion rate.

### Report lifecycle
`DRAFT → IN_REVIEW → FINALIZED → APPROVED`, each transition guarded server-side and
recorded in the audit trail. Finalizing recomputes and persists the composite score and
closes feedback. The owning manager can send an `IN_REVIEW` or `FINALIZED` report back to
`DRAFT` with a recorded reason, which reopens feedback and notifies the attorney.
Approved reports are immutable and feed the annual rollup.

## Scoring

Composite score = weighted mean of every rating, where each rating's weight is
`competency.weight × response.sourceWeight`. This encodes two firm policies in one
number: which competencies matter most (e.g. Ethics > Business Development) and which
voices carry most weight (e.g. Manager > a single Peer). See `src/lib/scoring.js`.

## AI layer

All AI runs **server-side** through `src/lib/ai/` (the Anthropic key never reaches the
SPA). The layer is fully optional: `aiEnabled()` is true only when `AI_ENABLED !== "false"`
and `ANTHROPIC_API_KEY` is set; otherwise every AI route returns `{ aiEnabled: false }` and
the UI shows an "AI not configured" state. Default model is `claude-opus-4-8` (override via
`AI_MODEL`).

| Feature | Service | Technique |
|---------|---------|-----------|
| Review Organizer | `organizeFeedback.js` | Structured output (Zod) → strengths/improvements/themes; persisted on `FeedbackResponse.organized` |
| Bias & Quality Check | `biasCheck.js` | Structured output → flags + specificity score; advisory, not persisted |
| Report Draft Assistant | `draftReport.js` | Streamed narrative (adaptive thinking) from 360 + memory; persisted on `PerformanceReview.aiDraftSummary` |
| Attorney Memory | `memory.js` | Longitudinal profile from APPROVED reports; auto-refreshed on approval; feeds the draft assistant |

Every call writes an `AiRun` audit row (kind, model, tokens, actor). AI outputs are always
human-editable and never auto-finalized — a manager owns the final report.

**Authorization** follows the same two-layer model as the rest of the API: role gate +
row-level ownership. E.g. memory read/refresh is scoped to ADMIN, the attorney, or their
owning manager.

> **Privacy / POPIA.** AI features send review free-text to the Anthropic API (no training
> on API data by default). Performance data is sensitive personal information; the firm
> should confirm this is acceptable. `AI_ENABLED="false"` disables the layer entirely.

## Notifications & SLA nudges

`src/lib/notify.js` writes `Notification` rows (best-effort — a failed notification never
breaks the triggering action). Notifications fire on launch (to each reviewer) and on every
state transition (to the subject). Managers also see an SLA nudge banner computed from the
existing `cycleTime` analytics (`launchedAt + slaDays`). Delivery is in-app only.

## PDF export

PDFs are generated **client-side** with `@react-pdf/renderer` (`frontend/src/pdf/`) — real
downloadable files, no backend headless browser. Four branded "Counsel" templates: approved
review report, annual rollup, client feedback summary, and manager team snapshot. The
`download.js` helper produces a blob on click after any needed data fetch.

## Home widgets & external APIs

The Zoho-style overview (greeting card, "This week" strip, activity feed, avatars) is fed by:
- `routes/widgets.js` — server-side proxies for a daily quote (ZenQuotes), office weather
  (Open-Meteo), and public holidays (Nager.Date). All cached in-memory, all degrade to a
  local fallback / empty array on upstream failure. Proxying keeps third parties from seeing
  individual user IPs/usage (POPIA) and centralizes caching. `EXTERNAL_WIDGETS_ENABLED="false"`
  skips the upstream calls entirely (the disposable demo sets it).
- `routes/activity.js` — a role-scoped recent-activity feed from `ReportEvent` (clients get
  their notifications instead).
- Avatars (`frontend/src/components/Avatar.jsx`) use DiceBear but **hash the seed
  (SHA-256 + salt) client-side first**, so no name or id is sent to the third party; a local
  monogram is the fallback.

## What a production hardening pass would add

This is a faithful, runnable v1. Before going live a firm would want:

- Refresh tokens + token revocation, password reset, SSO (most firms use Microsoft 365).
- Rate limiting, request logging to a store, and structured error tracking.
- Email/Teams notifications and reminders driven off `launchedAt` + `slaDays`.
- A proper migration history (`prisma migrate`) instead of `db push`.
- Tenanting if the platform serves multiple offices/entities.
- POPIA/GDPR controls: data-subject export, retention windows, and field-level access
  logging (performance data is sensitive personal information).
- Broader tests. Authentication, directory and one end-to-end quarterly workflow are covered
  today; SLA/overdue rules (see `docs/CADENCE.md`), goals and the AI layer with a live
  provider are not.
