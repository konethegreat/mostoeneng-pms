# Review cadence & the "launch button" — design rationale

The HR head asked us to "use industry standards to see how often a performance review is
done." Here's the standard we adopted and why, plus exactly how the system measures it.

## What professional-services firms actually do

Modern performance management in law firms and other professional-services organisations
has converged on a **continuous + periodic** model rather than a single annual event:

- **Annual formal review** — still the anchor for compensation, promotion and partnership
  decisions. This is the report of record.
- **Quarterly check-ins** — lighter-touch reviews that keep feedback timely, surface
  problems early, and feed the annual report so it isn't written from memory.
- **360° feedback** — input from manager, peers, subordinates, clients and the individual.
  Widely adopted in firms because a lawyer's performance is only partly visible to any one
  observer; clients and juniors see things the supervising partner doesn't.
- **Continuous / project-based feedback** — increasingly the direction of travel, but most
  firms anchor it to the quarterly rhythm so it stays manageable.

We implemented **360° + quarterly + annual rollup** (your selected option): four quarterly
reviews per attorney, each a full 360, with the four approved quarters rolling up into the
end-of-year report. This balances timeliness against review fatigue.

> Note: these are well-established norms in the field. If the firm wants the cadence tuned
> to a specific benchmark (e.g. a particular bar association guideline or a named HR
> framework), tell us the source and we'll align `slaDays` and cycle generation to it.

## How the system encodes the cadence

| Concept                | Where it lives                                              |
|------------------------|------------------------------------------------------------|
| Cycle frequency        | `ReviewCycle` rows (QUARTERLY × 4, one ANNUAL parent)      |
| Turnaround target      | `ReviewCycle.slaDays` (default 30 for quarterly, 45 annual)|
| When a review "starts" | `PerformanceReview.launchedAt` (the launch button)         |
| Annual rollup          | `ReviewCycle.parent`/`children` + `/dashboard/rollup`      |

## The launch button — why timing hangs off it

When an attorney presses **Launch Review**, `launchedAt` is stamped. From that instant the
system derives everything time-related:

- **Elapsed days** = `now − launchedAt` (or `approvedAt − launchedAt` once complete).
- **Overdue / SLA breach** = not yet approved *and* elapsed > `slaDays`.
- **Completion rate** = submitted feedback requests ÷ total requests, tracked from launch.
- **Average cycle time** (manager dashboard) = mean elapsed days across completed reviews.

This gives HR two answers the brief asked for: *how often* reviews happen (cycle cadence)
and *how long* each one takes from kickoff to a signed-off report (cycle time vs. SLA).

## Suggested defaults shipped in the seed

- Quarterly cycles: `slaDays = 30` (one month from launch to approved).
- Annual cycle: `slaDays = 45`.
- Source weights: Manager 1.5, Client 0.9, Peer 1.0, Subordinate 1.0, Self 0.8 — the self
  rating is intentionally discounted so it informs but doesn't dominate the score.

All of these are single-line config changes, so the firm can calibrate them after a pilot.
