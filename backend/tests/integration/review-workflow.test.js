// Exercises the fictional 360 review → feedback → report workflow over real HTTP:
// the actual server process, real logins, and a throwaway PostgreSQL container
// started by scripts/demo-runtime.mjs. Requires Docker; never touches DATABASE_URL.
// Steps that move the workflow forward are kept apart from the boundary checks, so
// a failed check does not hide later stages.
import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { startDemo } from "../../../scripts/demo-runtime.mjs";

const FINAL_SUMMARY = "Synthetic Q3 summary: Naledi kept the fictional Orion share-purchase checklist on schedule. Next quarter, hand first drafts to the candidate attorney earlier.";
const ACCOUNTS = [
  ["admin", "admin@example.test", "ADMIN"],
  ["manager", "t.dlamini@example.test", "MANAGER"],
  ["subject", "n.khumalo@example.test", "ATTORNEY"],
  ["peerA", "s.naidoo@example.test", "ATTORNEY"],
  ["peerB", "l.botha@example.test", "ATTORNEY"],
  ["junior", "p.moyo@example.test", "ATTORNEY"],
  ["client", "client@client.example.test", "CLIENT"],
  ["otherManager", "z.mthembu@example.test", "MANAGER"],
  ["otherAttorney", "j.vanwyk@example.test", "ATTORNEY"],
];
const SOURCE = { subject: "SELF", manager: "MANAGER", peerA: "PEER", peerB: "PEER", junior: "SUBORDINATE", client: "CLIENT" };
const HIDDEN_BEFORE_APPROVAL = ["overallScore", "analytics", "draftSummary", "aiDraftSummary", "finalSummary"];

test("fictional 360 review, feedback and report workflow over real HTTP", { timeout: 300000 }, async (t) => {
  // Production-like caller settings must not leak into the disposable demo.
  const inherited = {
    DATABASE_URL: "postgresql://caller:caller@127.0.0.1:1/caller_database_must_not_be_used",
    NODE_ENV: "production", ALLOW_DEMO_SEED: "false", SEED_PASSWORD: "",
    AI_ENABLED: "true", ANTHROPIC_API_KEY: "synthetic-unusable-provider-value",
    EXTERNAL_WIDGETS_ENABLED: "true", JWT_SECRET: "caller-signing-secret-that-must-not-sign-demo-tokens",
  };
  const previous = Object.fromEntries(Object.keys(inherited).map((key) => [key, process.env[key]]));
  let demo;
  try {
    Object.assign(process.env, inherited);
    demo = await startDemo();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  t.after(() => demo.stop());

  async function call(actor, path, { method = "GET", body, status = 200 } = {}) {
    const response = await fetch(`${demo.origin}/api${path}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  const people = {};
  await t.test("fictional accounts sign in over HTTP without exposing password hashes", async () => {
    for (const [key, email, role] of ACCOUNTS) {
      const session = await call(null, "/auth/login", { method: "POST", body: { email, password: demo.password } });
      assert.equal(session.user.role, role);
      assert.equal("passwordHash" in session.user, false);
      people[key] = { token: session.token, ...session.user };
      assert.equal((await call(people[key], "/auth/me")).user.id, session.user.id);
    }
  });
  const { admin, manager, subject, peerA, peerB, junior, client, otherManager, otherAttorney } = people;

  await t.test("wrong passwords, malformed requests, missing and forged tokens are rejected", async () => {
    await call(null, "/auth/login", { method: "POST", body: { email: "t.dlamini@example.test", password: `${demo.password}-wrong` }, status: 401 });
    await call(null, "/reviews", { status: 401 });
    await call({ token: "forged.token.value" }, "/reviews", { status: 401 });
    // A token signed with the caller's secret proves the demo generated its own.
    const callerSigned = jwt.sign({ sub: admin.id, role: "ADMIN", email: admin.email }, inherited.JWT_SECRET, { algorithm: "HS256" });
    await call({ token: callerSigned }, "/reviews", { status: 401 });
    await call(null, "/auth/login", { method: "POST", body: { email: 404, password: "not-a-string-email" }, status: 400 });
    await call(manager, "/reviews?cycleId=one&cycleId=two", { status: 400 });
    const malformed = await fetch(`${demo.origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json", signal: AbortSignal.timeout(15000),
    });
    assert.equal(malformed.status, 400, await malformed.text());
  });

  await t.test("the demo runs with AI and external widget calls switched off", async () => {
    const health = await call(null, "/health");
    assert.equal(health.aiEnabled, false);
    assert.equal(health.externalWidgets, false);
    assert.deepEqual(await call(manager, "/ai/status"), { aiEnabled: false, model: null });
    const greeting = await call(subject, "/widgets/greeting");
    assert.equal(greeting.weather, null);
    assert.equal(typeof greeting.quote.text, "string");
    assert.deepEqual(await call(subject, "/widgets/holidays?year=2026"), []);
  });

  let annual;
  let q2;
  let q3;
  const quarter = { name: "Q3 2026", type: "QUARTERLY", periodStart: "2026-07-01", periodEnd: "2026-09-30", slaDays: 30 };
  await t.test("the administrator opens a Q3 cycle that rolls up into the annual cycle", async () => {
    const cycles = await call(admin, "/cycles");
    annual = cycles.find((cycle) => cycle.name === "FY2026 Annual" && cycle.type === "ANNUAL");
    q2 = cycles.find((cycle) => cycle.name === "Q2 2026");
    assert.ok(annual && q2);
    q3 = await call(admin, "/cycles", { method: "POST", body: { ...quarter, parentId: annual.id }, status: 201 });
    assert.equal(q3.status, "OPEN");
    assert.equal(q3.parentId, annual.id);
  });

  await t.test("cycle creation is administrator-only and validates type, dates, SLA and parent", async () => {
    const body = { ...quarter, parentId: annual.id };
    for (const actor of [manager, subject, client]) await call(actor, "/cycles", { method: "POST", body, status: 403 });
    const invalid = [
      { name: "   " },
      { type: "WEEKLY" },
      { periodEnd: "2026-06-30" },
      { periodStart: "not-a-date" },
      { slaDays: 0 },
      { parentId: q2.id },
      { parentId: "missing-cycle" },
      { type: "ANNUAL" },
    ];
    for (const [index, change] of invalid.entries()) {
      await call(admin, "/cycles", { method: "POST", body: { ...body, name: `Rejected cycle ${index}`, ...change }, status: 400 });
    }
    await call(admin, "/cycles", { method: "POST", body, status: 409 });
    await call(admin, "/cycles/missing-cycle/close", { method: "PATCH", status: 404 });
    const children = (await call(admin, "/cycles")).find((cycle) => cycle.id === annual.id).children;
    assert.deepEqual(children.map((cycle) => cycle.name).sort(), ["Q1 2026", "Q2 2026", "Q3 2026"]);
  });

  let review;
  await t.test("the attorney launches the Q3 review once", async () => {
    review = await call(subject, "/reviews/launch", { method: "POST", body: { cycleId: q3.id }, status: 201 });
    assert.equal(review.status, "LAUNCHED");
    assert.ok(review.launchedAt);
    await call(subject, "/reviews/launch", { method: "POST", body: { cycleId: q3.id }, status: 409 });
  });

  await t.test("launch is limited to open quarterly cycles and subjects with a reviewing manager", async () => {
    await call(subject, "/reviews/launch", { method: "POST", body: { cycleId: annual.id }, status: 400 });
    await call(client, "/reviews/launch", { method: "POST", body: { cycleId: q3.id }, status: 403 });
    await call(admin, "/reviews/launch", { method: "POST", body: { cycleId: q3.id }, status: 403 });
    // A partner without a reviewing manager would otherwise own and approve their own review.
    await call(manager, "/reviews/launch", { method: "POST", body: { cycleId: q3.id }, status: 409 });
    assert.deepEqual((await call(manager, "/dashboard/attorney")).launchable, []);
    assert.deepEqual((await call(peerB, "/dashboard/attorney")).launchable.map((cycle) => cycle.name), ["Q2 2026", "Q3 2026"]);
    assert.deepEqual((await call(subject, "/dashboard/attorney")).launchable, []);
  });

  const requestFor = {};
  await t.test("launch asks each 360 source once and notifies every reviewer except the subject", async () => {
    const owed = {};
    for (const [key, role] of Object.entries(SOURCE)) {
      owed[key] = (await call(people[key], "/feedback/mine")).filter((r) => r.subject.id === subject.id && r.cycle.id === q3.id);
      requestFor[key] = owed[key].find((r) => r.reviewerRole === role)?.id;
    }
    const detail = await call(manager, `/reviews/${review.id}`);
    assert.deepEqual(detail.requests.map((r) => `${r.reviewerRole}:${r.reviewer.id}`).sort(), [
      `CLIENT:${client.id}`, `MANAGER:${manager.id}`, `PEER:${peerA.id}`, `PEER:${peerB.id}`,
      `SELF:${subject.id}`, `SUBORDINATE:${junior.id}`,
    ].sort());
    for (const [key, rows] of Object.entries(owed)) {
      assert.equal(rows.length, 1, `${key} should owe exactly one Q3 form for the subject`);
      assert.equal(rows[0].open, true);
    }
    for (const actor of [manager, peerA, peerB, junior, client]) {
      const { items } = await call(actor, "/notifications");
      assert.ok(items.some((n) => n.type === "FEEDBACK_REQUESTED" && n.message.includes("Q3 2026")));
    }
    assert.equal((await call(subject, "/notifications")).items.length, 0);
    for (const actor of [otherManager, otherAttorney]) assert.deepEqual(await call(actor, "/feedback/mine"), []);
  });

  const competencies = [];
  const ratings = (score) => competencies.map((competency) => ({ competencyId: competency.id, score }));
  const submit = (actor, key, score, text = {}) => call(actor, `/feedback/request/${requestFor[key]}`, {
    method: "POST", body: { ratings: ratings(score), ...text }, status: 201,
  });
  await t.test("reviewers read the competency framework and only their own feedback form", async () => {
    competencies.push(...await call(client, "/users/competencies"));
    assert.equal(competencies.length, 8);
    const form = await call(client, `/feedback/request/${requestFor.client}`);
    assert.equal(form.open, true);
    assert.equal(form.subject.id, subject.id);
    await call(peerA, `/feedback/request/${requestFor.client}`, { status: 403 });
    await call(peerA, `/feedback/request/${requestFor.client}`, { method: "POST", body: { ratings: ratings(1) }, status: 403 });
  });

  await t.test("invalid feedback is rejected without leaving a partial response", async () => {
    for (const body of [
      {},
      { ratings: [] },
      { ratings: ratings(6) },
      { ratings: ratings(2.5) },
      { ratings: [{ competencyId: "missing-competency", score: 3 }] },
      { ratings: [...ratings(3), { competencyId: competencies[0].id, score: 4 }] },
      { ratings: ratings(3), strengths: { html: "<b>not text</b>" } },
    ]) {
      await call(peerA, `/feedback/request/${requestFor.peerA}`, { method: "POST", body, status: 400 });
    }
    const untouched = await call(peerA, `/feedback/request/${requestFor.peerA}`);
    assert.equal(untouched.existing, null);
    assert.equal(untouched.status, "PENDING");
  });

  await t.test("five sources submit and a client edit replaces its earlier ratings", async () => {
    await submit(subject, "subject", 4, { strengths: "Kept the fictional Orion checklist on schedule.", improvements: "Delegate first drafts earlier." });
    await submit(manager, "manager", 4, { strengths: "Clear, well-supported advice on the synthetic file.", improvements: "Share more business-development leads." });
    await submit(peerA, "peerA", 3, { strengths: "Reliable research partner.", improvements: "Answer internal review requests sooner." });
    await submit(junior, "junior", 5, { strengths: "Patient, specific mentoring.", improvements: null });
    await submit(client, "client", 4, { strengths: "Responsive on the fictional supply contract." });
    await submit(client, "client", 5, { strengths: "Responsive and clear on the fictional supply contract." });
    const edited = await call(client, `/feedback/request/${requestFor.client}`);
    assert.equal(edited.existing.ratings.length, 8);
    assert.ok(edited.existing.ratings.every((rating) => rating.score === 5));
    assert.match(edited.existing.strengths, /Responsive and clear/);
    const detail = await call(manager, `/reviews/${review.id}`);
    assert.deepEqual(detail.completion, { total: 6, submitted: 5, pct: 83 });
    assert.equal(detail.analytics.overallScore, 4.17);
  });

  await t.test("the owning manager saves a draft report", async () => {
    const saved = await call(manager, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: "Synthetic draft: strong quarter; one peer still to respond." } });
    assert.equal(saved.status, "DRAFT");
    const detail = await call(manager, `/reviews/${review.id}`);
    assert.equal(detail.overallScore, 4.17);
    assert.match(detail.draftSummary, /one peer still to respond/);
  });

  await t.test("the attorney sees no scores, drafts or summaries before approval and cannot act", async () => {
    const own = await call(subject, `/reviews/${review.id}`);
    for (const field of HIDDEN_BEFORE_APPROVAL) assert.equal(own[field], null, `subject received ${field} before approval`);
    assert.equal(own.requests.length, 6);
    assert.ok(own.requests.every((request) => !("email" in request.reviewer)));
    assert.equal((await call(subject, "/reviews")).find((row) => row.id === review.id).overallScore, null);
    const card = (await call(subject, "/dashboard/attorney")).cards.find((row) => row.reviewId === review.id);
    assert.equal(card.overallScore, null);
    assert.equal(card.byCompetency, null);
    await call(subject, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: "Self-written" }, status: 403 });
    for (const action of ["submit", "finalize", "approve", "send-back"]) {
      await call(subject, `/reviews/${review.id}/${action}`, { method: "POST", body: { finalSummary: "Self-approved" }, status: 403 });
    }
  });

  await t.test("reviewers get a skeleton without scores, narratives, other reviewers or history", async () => {
    for (const [key, actor] of Object.entries({ client, peerA, junior })) {
      const skeleton = await call(actor, `/reviews/${review.id}`);
      for (const field of HIDDEN_BEFORE_APPROVAL) assert.equal(skeleton[field], null, `${key} received ${field}`);
      assert.deepEqual(skeleton.requests.map((request) => request.id), [requestFor[key]]);
      assert.deepEqual(skeleton.events, []);
      assert.deepEqual(skeleton.goals, []);
      assert.equal("email" in skeleton.subject, false);
      assert.equal("email" in skeleton.manager, false);
    }
    const full = await call(admin, `/reviews/${review.id}`);
    assert.equal(full.analytics.overallScore, 4.17);
    assert.ok(full.requests.every((request) => request.reviewer.email.endsWith("example.test")));
    assert.deepEqual(await call(client, "/reviews"), []);
    await call(client, "/dashboard/manager", { status: 403 });
  });

  await t.test("another team's manager and attorney cannot read or change this review", async () => {
    await call(otherManager, `/reviews/${review.id}`, { status: 403 });
    await call(otherAttorney, `/reviews/${review.id}`, { status: 403 });
    assert.deepEqual((await call(otherManager, "/dashboard/manager")).reviews.map((row) => row.subject), ["Johan van Wyk"]);
    assert.equal((await call(otherManager, "/reviews")).some((row) => row.id === review.id), false);
    await call(otherManager, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: "Cross-team edit" }, status: 403 });
    for (const action of ["submit", "finalize", "approve", "send-back"]) {
      await call(otherManager, `/reviews/${review.id}/${action}`, { method: "POST", body: { note: "Cross-team attempt", finalSummary: "Cross-team" }, status: 403 });
    }
    const unchanged = await call(manager, `/reviews/${review.id}`);
    assert.equal(unchanged.status, "DRAFT");
    assert.deepEqual(unchanged.events.map((event) => event.action), ["LAUNCHED", "DRAFT_SAVED"]);
  });

  await t.test("only the subject, their managers and administrators read the annual rollup", async () => {
    for (const actor of [otherManager, peerA, client]) {
      await call(actor, `/dashboard/rollup/${subject.id}/${annual.id}`, { status: 403 });
    }
    for (const actor of [subject, manager, admin]) await call(actor, `/dashboard/rollup/${subject.id}/${annual.id}`);
  });

  await t.test("drafts and transitions require a launched review and well-formed text", async () => {
    const notLaunched = (await call(manager, "/reviews")).find((row) => row.subject.id === peerB.id && row.cycle.id === q2.id);
    assert.equal(notLaunched.status, "NOT_STARTED");
    await call(manager, `/reviews/${notLaunched.id}/draft`, { method: "PATCH", body: { draftSummary: "Too early" }, status: 409 });
    await call(manager, `/reviews/${notLaunched.id}/submit`, { method: "POST", body: {}, status: 409 });
    await call(manager, `/reviews/${review.id}/approve`, { method: "POST", body: {}, status: 409 });
    await call(manager, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: 42 }, status: 400 });
    await call(manager, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: "x".repeat(20001) }, status: 400 });
    await call(manager, `/reviews/${review.id}/finalize`, { method: "POST", body: { finalSummary: { text: "not a string" } }, status: 400 });
    assert.equal((await call(manager, `/reviews/${review.id}`)).status, "DRAFT");
  });

  await t.test("the owning manager submits and finalizes; finalization locks feedback and drafts", async () => {
    assert.equal((await call(manager, `/reviews/${review.id}/submit`, { method: "POST", body: {} })).status, "IN_REVIEW");
    const finalized = await call(manager, `/reviews/${review.id}/finalize`, {
      method: "POST", body: { finalSummary: "Synthetic Q3 summary, finalized before the second peer responded." },
    });
    assert.equal(finalized.status, "FINALIZED");
    const locked = await call(manager, `/reviews/${review.id}`);
    assert.equal(locked.overallScore, 4.17);
    assert.ok(locked.finalizedAt);
    await call(peerB, `/feedback/request/${requestFor.peerB}`, { method: "POST", body: { ratings: ratings(4) }, status: 409 });
    assert.equal((await call(peerB, "/feedback/mine")).find((row) => row.id === requestFor.peerB).open, false);
    assert.equal((await call(peerB, `/feedback/request/${requestFor.peerB}`)).open, false);
    await call(manager, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: "Late edit" }, status: 409 });
  });

  await t.test("send-back reopens the report for late feedback and records the reason", async () => {
    const sentBack = await call(manager, `/reviews/${review.id}/send-back`, { method: "POST", body: { note: "Reopened for the second peer's feedback." } });
    assert.equal(sentBack.status, "DRAFT");
    await submit(peerB, "peerB", 4, { strengths: "Thorough closing checklist on the synthetic transaction.", improvements: "Flag scope changes sooner." });
    const reopened = await call(manager, `/reviews/${review.id}`);
    assert.equal(reopened.finalizedAt, null);
    assert.deepEqual(reopened.completion, { total: 6, submitted: 6, pct: 100 });
    assert.equal(reopened.analytics.overallScore, 4.15);
    assert.ok((await call(subject, "/notifications")).items.some((n) => n.type === "SENT_BACK"));
    await call(manager, `/reviews/${review.id}/send-back`, { method: "POST", body: {}, status: 409 });
  });

  await t.test("the owning manager re-finalizes and approves the report", async () => {
    await call(manager, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: "Synthetic draft updated after all six sources responded." } });
    await call(manager, `/reviews/${review.id}/finalize`, { method: "POST", body: { finalSummary: FINAL_SUMMARY } });
    const approved = await call(manager, `/reviews/${review.id}/approve`, { method: "POST", body: { note: "Approved at the fictional calibration meeting." } });
    assert.equal(approved.status, "APPROVED");
    const record = await call(manager, `/reviews/${review.id}`);
    assert.equal(record.overallScore, 4.15);
    assert.equal(record.finalSummary, FINAL_SUMMARY);
    assert.ok(record.approvedAt);
    assert.deepEqual(record.events.map((event) => event.action),
      ["LAUNCHED", "DRAFT_SAVED", "SUBMITTED", "FINALIZED", "SENT_BACK", "DRAFT_SAVED", "FINALIZED", "APPROVED"]);
    assert.equal(record.events.find((event) => event.action === "SENT_BACK").note, "Reopened for the second peer's feedback.");
  });

  await t.test("the approved report and its feedback can no longer change", async () => {
    for (const action of ["submit", "finalize", "approve", "send-back"]) {
      await call(manager, `/reviews/${review.id}/${action}`, { method: "POST", body: { finalSummary: "Rewrite", note: "Too late" }, status: 409 });
    }
    await call(manager, `/reviews/${review.id}/draft`, { method: "PATCH", body: { draftSummary: "Rewrite" }, status: 409 });
    await call(client, `/feedback/request/${requestFor.client}`, { method: "POST", body: { ratings: ratings(1) }, status: 409 });
    const record = await call(manager, `/reviews/${review.id}`);
    assert.equal(record.finalSummary, FINAL_SUMMARY);
    assert.equal(record.analytics.overallScore, 4.15);
  });

  await t.test("after approval the attorney sees the report, the scores and the annual rollup", async () => {
    const own = await call(subject, `/reviews/${review.id}`);
    assert.equal(own.overallScore, 4.15);
    assert.equal(own.finalSummary, FINAL_SUMMARY);
    assert.equal(own.draftSummary, null);
    assert.equal(own.analytics.byCompetency.length, 8);
    assert.ok(own.analytics.byCompetency.every((row) => row.average === 4.15));
    assert.deepEqual(Object.fromEntries(own.analytics.bySource.map((row) => [row.source, row.average])),
      { SELF: 4, MANAGER: 4, PEER: 3.5, SUBORDINATE: 5, CLIENT: 5 });
    const dashboard = await call(subject, "/dashboard/attorney");
    const card = dashboard.cards.find((row) => row.reviewId === review.id);
    assert.equal(card.overallScore, 4.15);
    assert.equal(card.finalSummary, FINAL_SUMMARY);
    assert.deepEqual(dashboard.trend.map((point) => point.cycle), ["Q1 2026", "Q3 2026"]);
    const rollup = await call(subject, `/dashboard/rollup/${subject.id}/${annual.id}`);
    assert.deepEqual(rollup.quarters.map((row) => row.cycle), ["Q1 2026", "Q3 2026"]);
    assert.equal(rollup.quartersComplete, 2);
    assert.equal(rollup.quartersTotal, 3);
    assert.equal(rollup.annualScore, Math.round(((4.3 + 4.15) / 2) * 100) / 100);
    assert.deepEqual(await call(manager, `/dashboard/rollup/${subject.id}/${annual.id}`), rollup);
    assert.deepEqual(await call(admin, `/dashboard/rollup/${subject.id}/${annual.id}`), rollup);
  });

  await t.test("notifications and activity reach only the people involved", async () => {
    const forReview = (await call(subject, "/notifications")).items.filter((n) => n.link === `/reviews/${review.id}`);
    assert.deepEqual(forReview.map((n) => n.type).reverse(), ["STATE_CHANGE", "STATE_CHANGE", "SENT_BACK", "STATE_CHANGE", "APPROVED"]);
    for (const actor of [otherManager, otherAttorney]) {
      assert.equal((await call(actor, "/notifications")).items.length, 0);
      assert.equal((await call(actor, "/activity")).some((row) => row.link === `/reviews/${review.id}`), false);
    }
    assert.ok((await call(manager, "/activity")).some((row) => row.link === `/reviews/${review.id}` && row.action === "APPROVED"));
    assert.ok((await call(client, "/activity")).every((row) => row.action === "FEEDBACK_REQUESTED"));
  });

  await t.test("AI assistance returns the disabled contract instead of calling a provider", async () => {
    assert.deepEqual(await call(manager, `/ai/reviews/${review.id}/draft`, { method: "POST" }), { aiEnabled: false });
    assert.deepEqual(await call(manager, `/ai/organize/${requestFor.client}`, { method: "POST" }), { aiEnabled: false });
    assert.deepEqual(await call(peerA, "/ai/bias-check", { method: "POST", body: { strengths: "Synthetic text" } }), { aiEnabled: false });
  });

  await t.test("the approved report persists across an API restart and a fresh sign-in", async () => {
    await demo.restart();
    const session = await call(null, "/auth/login", { method: "POST", body: { email: "n.khumalo@example.test", password: demo.password } });
    const reloaded = await call({ token: session.token }, `/reviews/${review.id}`);
    assert.equal(reloaded.status, "APPROVED");
    assert.equal(reloaded.overallScore, 4.15);
    assert.equal(reloaded.finalSummary, FINAL_SUMMARY);
    // Sessions issued before the restart stay valid until expiry; v1 has no revocation.
    assert.equal((await call(manager, `/reviews/${review.id}`)).status, "APPROVED");
  });
});
