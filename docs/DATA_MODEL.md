# Data model

The schema lives in `backend/prisma/schema.prisma`. This document explains the *why*.

## Entities at a glance

```
PracticeGroup ──< User >── manager/reports (self-relation)
                   │
                   │ subject / manager
                   ▼
ReviewCycle ──< PerformanceReview >── FeedbackRequest ──1:1── FeedbackResponse ──< Rating >── Competency
   │ (parent/child rollup)             │
   │                                   ├──< Goal
   └── ANNUAL ⟵ QUARTERLY              └──< ReportEvent  (audit trail)
```

## Entities

### User & PracticeGroup
One `User` table holds every actor — `ADMIN`, `MANAGER`, `ATTORNEY`, `CLIENT` — separated
by `role`. Org structure is modelled two ways:

- `managerId` self-relation → who reports to whom (drives the *manager* and *subordinate*
  feedback sources).
- `practiceGroupId` → which group an attorney belongs to (drives *peer* selection and is
  where a review conceptually "starts", per the brief).

Clients carry a `clientAccount` label and never get an org position.

### ReviewCycle
A time window the firm runs. `type` is `QUARTERLY` or `ANNUAL`. An annual cycle is the
`parent` of its four quarterly `children` — this is the rollup spine. `slaDays` is the
target turnaround from launch to approval and powers the overdue flag.

### PerformanceReview
One attorney's review within one cycle (`@@unique([subjectId, cycleId])`). It holds the
four lifecycle timestamps — `launchedAt`, `submittedAt`, `finalizedAt`, `approvedAt` —
the manager's `draftSummary`/`finalSummary`, the computed `overallScore`, and a `status`
enum. `launchedAt` is deliberately the anchor for all cadence analytics.

### Competency
The shared rating framework (8 seeded competencies across Technical / Client / Business /
Behavioural categories). Each carries a `weight` so the firm can say Ethics and Legal
Knowledge count more than Business Development.

### FeedbackRequest & FeedbackResponse & Rating
A `FeedbackRequest` is "person X owes feedback on this review as a PEER/MANAGER/…".
`@@unique([reviewId, reviewerId, reviewerRole])` prevents duplicate asks. When answered it
gets a single `FeedbackResponse` (strengths, improvements, and a `sourceWeight`), which in
turn holds one `Rating` per competency (`score` 1–5). Splitting request from response lets
us track *completion rate* (asked vs. answered) cleanly.

### Goal
The "improve them / hold accountable" half of the brief. A development goal can hang off a
specific review or just off the attorney, with a `GoalStatus` lifecycle.

### ReportEvent
Append-only audit trail of every state transition (`LAUNCHED`, `DRAFT_SAVED`, `SUBMITTED`,
`FINALIZED`, `APPROVED`, `SENT_BACK`) with actor, timestamp and optional note. Essential
for an HR system that may need to defend a decision.

## Enums

| Enum          | Values                                                            |
|---------------|-------------------------------------------------------------------|
| Role          | ADMIN, MANAGER, ATTORNEY, CLIENT                                  |
| CycleType     | QUARTERLY, ANNUAL                                                 |
| CycleStatus   | OPEN, CLOSED                                                      |
| ReviewStatus  | NOT_STARTED, LAUNCHED, DRAFT, IN_REVIEW, FINALIZED, APPROVED      |
| ReviewerRole  | SELF, MANAGER, PEER, SUBORDINATE, CLIENT                          |
| RequestStatus | PENDING, SUBMITTED, DECLINED                                      |
| GoalStatus    | OPEN, IN_PROGRESS, ACHIEVED, MISSED                               |

## Why one composite number *and* a breakdown

The `overallScore` is convenient for ranking and trends, but it can hide problems. So the
API always also returns `byCompetency` (where is this person strong/weak) and `bySource`
(do peers and clients agree with the self-rating — a blind-spot check). The UI shows both.
