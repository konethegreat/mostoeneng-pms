# Demo Legal PMS — Production Hosting, Scaling & Deployment

*Prepared for the HR-head stakeholder and the implementation team. Companion to `docs/ARCHITECTURE.md`. Date: 2026-06-01.*

## What we are deploying

Three deployable pieces, exactly as the codebase is structured today:

1. **A static React SPA** (Vite build → plain HTML/JS/CSS). No server-side rendering, no runtime on the front end — it is just files served to the browser.
2. **A Node/Express API** (Prisma ORM, JWT auth, weighted scoring). Stateless: every request carries its own Bearer token, so no server-side session store is needed.
3. **A PostgreSQL database** holding the entire relational model — users, cycles, reviews, feedback, ratings, goals, and the immutable `ReportEvent` audit trail.

Because the SPA talks to the API only over the `/api/*` HTTP surface, each piece can be hosted, scaled, and redeployed independently. That separation is the single most important property for everything below.

## The two constraints that decide the host

This is performance data on named individuals at a professional-services firm, so two non-technical facts drive the recommendation more than price or convenience:

**Data protection (POPIA).** Performance reviews are sensitive personal information under South Africa's Protection of Personal Information Act. That argues for keeping data in-region where practical, encryption at rest and in transit, access logging, retention windows, and a data-subject export path. `docs/ARCHITECTURE.md` already flags these as the pre-live punch list.

**Microsoft 365 alignment.** The architecture doc notes that most firms in this space run Microsoft 365, and SSO via Entra ID (Azure AD) is the expected login path. If the firm is already on M365, hosting on Azure removes a vendor and makes SSO, email/Teams reminders, and identity governance a configuration step rather than an integration project.

## Recommended path — best fit

**Microsoft Azure, South Africa North region (Johannesburg).**

| Piece | Service | Why |
|---|---|---|
| React SPA | **Azure Static Web Apps** | Global CDN, free TLS, atomic deploys, integrates with the same Git repo. |
| Express API | **Azure App Service (Linux, Node)** | Managed Node runtime, no Docker required, autoscale rules, slots for zero-downtime deploys. |
| Database | **Azure Database for PostgreSQL — Flexible Server** | Managed Postgres with automated backups, point-in-time restore, encryption at rest, in-region residency. |
| Identity | **Entra ID (Azure AD)** | Native M365 SSO; replaces the dev-only JWT-from-password flow. |
| Secrets | **Azure Key Vault** | `DATABASE_URL`, `JWT_SECRET`, SMTP creds live here — never in a deployed `.env`. |
| Notifications | **Microsoft Graph / Teams + email** | SLA reminders off `launchedAt` + `slaDays` go through the channels the firm already uses. |
| Observability | **Application Insights** (or Sentry) | Error tracking, request logging, and cycle-time/SLA dashboards. |

Why this over a hyperscaler-heavy design: it is the smallest number of moving parts that still gives in-region residency, M365 SSO, and managed backups. There is no Kubernetes, no container registry to babysit, and no separate identity provider — appropriate for a single firm rather than a multi-product platform.

## Budget alternative — fastest and cheapest to stand up

If the firm wants to be live this week for the cost of a couple of coffees a month, and is comfortable with EU data residency under POPIA's cross-border transfer provisions:

- **SPA →** Cloudflare Pages or Netlify (free tier, global CDN).
- **API →** Render or Railway web service (managed Node, deploy from Git, no Docker needed).
- **Database →** Neon or Supabase managed Postgres (generous free/hobby tiers, connection pooling built in).

Trade-off to state plainly: these providers' nearest regions are typically Frankfurt/EU, not South Africa. POPIA permits cross-border processing where the receiving country has comparable protection (the EU qualifies), but in-region (Azure SA North) is the cleaner compliance story for a law firm. Use the budget path for a pilot or internal demo; use the Azure path for the real rollout.

## How it scales

The good news is the API is already **stateless** (JWT in the request, no server session), which is the precondition for horizontal scaling. The scaling path, in the order you would actually hit the ceilings:

1. **Scale up first.** Bump the App Service plan and the Postgres tier. For a single firm — dozens of attorneys, a few hundred reviews a year — one well-sized API instance and a small managed database will carry the load comfortably. Don't pre-optimise.
2. **Scale out the API.** When one instance isn't enough, run N replicas behind the load balancer. No code change required because there's no shared in-process state.
3. **Pool database connections.** This is the first real gotcha when you add API replicas: each replica opens its own Postgres connections and the database runs out. Put **PgBouncer** (or Azure's built-in connection pooling) in front and point Prisma at the pooler.
4. **Add a read replica** when dashboards dominate. The manager dashboard, rollups, and analytics are read-heavy and tolerate slightly stale data; route those reads to a replica and keep writes on the primary.
5. **Move reminders to a queue + scheduled worker.** Today's flow is synchronous. SLA reminders driven off `launchedAt` + `slaDays` belong on a small scheduled worker reading overdue reviews and emitting Teams/email — decoupled from the request path. (Shown as the async lane in the architecture diagram.)
6. **Cache hot, rarely-changing reads** (the competency framework, practice-group lists) in Redis only if profiling shows it's worth it.
7. **Multi-tenancy** only if the platform later serves multiple offices/entities — at which point tenant scoping on every query becomes a first-class concern.

The honest summary: for this firm's size, steps 1–2 are almost certainly all you'll ever need. Steps 3–7 are the playbook for *if* it grows, not a day-one checklist.

## Production hardening checklist (before go-live)

These come straight from the punch list in `docs/ARCHITECTURE.md`, sequenced:

- **Migrations:** switch from `prisma db push` to a real `prisma migrate` history so schema changes are versioned and reversible.
- **Auth:** refresh tokens + revocation, password reset, and Entra ID SSO replacing the demo password flow.
- **Edges:** rate limiting, structured request logging to a store, and error tracking (App Insights/Sentry).
- **Notifications:** email/Teams reminders wired to `launchedAt` + `slaDays`.
- **POPIA controls:** data-subject export, retention windows, field-level access logging (performance data is sensitive), encryption at rest + in transit, automated backups with point-in-time restore.
- **Secrets:** out of `.env` and into Key Vault / platform secrets.
- **CI/CD:** build → test → deploy pipeline with a staging slot.
- **Tests:** start with the SLA/cycle-time rules in `docs/CADENCE.md` and the lifecycle state guards — they're the logic most expensive to get wrong.

## One-line recommendation

Build toward **Azure (SA North): Static Web Apps + App Service + Flexible-Server Postgres + Entra ID**, because it gives in-region POPIA residency and free M365 SSO with the fewest moving parts. Use **Render/Neon + Cloudflare Pages** for a quick pilot, accepting EU data residency as the trade-off.
