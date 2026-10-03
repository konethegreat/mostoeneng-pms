import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { computeOverallScore, competencyBreakdown, bySourceBreakdown, completionRate, cycleTime } from "../lib/scoring.js";
import { notify, notifyMany } from "../lib/notify.js";

const router = Router();

const FULL_INCLUDE = {
  subject: true,
  manager: true,
  cycle: true,
  goals: true,
  events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
  requests: {
    include: { reviewer: true, response: { include: { ratings: { include: { competency: true } } } } },
  },
};

// Has this user got rights to see this review?
function canView(user, review) {
  if (user.role === "ADMIN") return true;
  if (review.managerId === user.id) return true;          // owning manager
  if (review.subjectId === user.id) return true;          // the attorney
  if (review.requests?.some((r) => r.reviewerId === user.id)) return true; // a reviewer
  return false;
}

// ── List reviews (scoped by role) ──
router.get("/", requireAuth, async (req, res) => {
  const { cycleId } = req.query;
  let where = {};
  if (cycleId) where.cycleId = cycleId;

  if (req.user.role === "ADMIN") {
    // all
  } else if (req.user.role === "MANAGER") {
    where.managerId = req.user.id;
  } else if (req.user.role === "ATTORNEY") {
    where.subjectId = req.user.id;
  } else {
    where = { id: "none" }; // clients use /feedback, not this list
  }

  const reviews = await prisma.performanceReview.findMany({
    where,
    include: { subject: true, cycle: true, requests: true },
    orderBy: { updatedAt: "desc" },
  });

  res.json(reviews.map((r) => ({
    id: r.id, status: r.status, overallScore: r.overallScore,
    launchedAt: r.launchedAt, approvedAt: r.approvedAt,
    subject: { id: r.subject.id, name: `${r.subject.firstName} ${r.subject.lastName}`, title: r.subject.title },
    cycle: { id: r.cycle.id, name: r.cycle.name, type: r.cycle.type, slaDays: r.cycle.slaDays },
    completion: completionRate(r.requests),
    cycleTime: cycleTime(r, r.cycle.slaDays),
  })));
});

// ── Review detail with computed analytics ──
router.get("/:id", requireAuth, async (req, res) => {
  const review = await prisma.performanceReview.findUnique({ where: { id: req.params.id }, include: FULL_INCLUDE });
  if (!review) return res.status(404).json({ error: "Not found" });
  if (!canView(req.user, review)) return res.status(403).json({ error: "Forbidden" });

  const responses = review.requests.map((r) => r.response).filter(Boolean);
  // A reviewer who isn't the manager/subject/admin only sees the skeleton, not others' scores
  const privileged = ["ADMIN"].includes(req.user.role) || review.managerId === req.user.id || review.subjectId === req.user.id;

  res.json({
    id: review.id,
    status: review.status,
    subject: pub(review.subject),
    manager: pub(review.manager),
    cycle: review.cycle,
    launchedAt: review.launchedAt,
    submittedAt: review.submittedAt,
    finalizedAt: review.finalizedAt,
    approvedAt: review.approvedAt,
    draftSummary: review.draftSummary,
    finalSummary: review.finalSummary,
    aiDraftSummary: review.aiDraftSummary,
    overallScore: review.overallScore,
    goals: review.goals,
    events: review.events.map((e) => ({ id: e.id, action: e.action, note: e.note, at: e.createdAt, actor: `${e.actor.firstName} ${e.actor.lastName}` })),
    requests: review.requests.map((r) => ({
      id: r.id, reviewerRole: r.reviewerRole, status: r.status, dueDate: r.dueDate,
      reviewer: pub(r.reviewer),
      submitted: !!r.response,
    })),
    completion: completionRate(review.requests),
    cycleTime: cycleTime(review, review.cycle.slaDays),
    analytics: privileged ? {
      overallScore: computeOverallScore(responses),
      byCompetency: competencyBreakdown(responses),
      bySource: bySourceBreakdown(review.requests),
    } : null,
  });
});

// ── LAUNCH: the attorney presses the launch button ──
router.post("/launch", requireAuth, async (req, res) => {
  const { cycleId } = req.body || {};
  if (!cycleId) return res.status(400).json({ error: "cycleId required" });
  if (req.user.role !== "ATTORNEY" && req.user.role !== "MANAGER") {
    return res.status(403).json({ error: "Only the attorney being reviewed can launch" });
  }

  const cycle = await prisma.reviewCycle.findUnique({ where: { id: cycleId } });
  if (!cycle || cycle.status !== "OPEN") return res.status(400).json({ error: "Cycle not open" });

  // Find or create the review for this attorney+cycle
  let review = await prisma.performanceReview.findUnique({
    where: { subjectId_cycleId: { subjectId: req.user.id, cycleId } },
  });

  const me = await prisma.user.findUnique({ where: { id: req.user.id }, include: { reports: true } });
  if (!review) {
    review = await prisma.performanceReview.create({
      data: { subjectId: me.id, cycleId, managerId: me.managerId || me.id, status: "NOT_STARTED" },
    });
  }
  if (review.launchedAt) return res.status(409).json({ error: "Already launched" });

  // Fan out 360 feedback requests
  const dueDate = cycle.periodEnd;
  const reviewers = await build360(me);
  for (const r of reviewers) {
    await prisma.feedbackRequest.upsert({
      where: { reviewId_reviewerId_reviewerRole: { reviewId: review.id, reviewerId: r.reviewerId, reviewerRole: r.role } },
      update: {},
      create: { reviewId: review.id, reviewerId: r.reviewerId, reviewerRole: r.role, dueDate },
    });
  }

  const updated = await prisma.performanceReview.update({
    where: { id: review.id },
    data: { status: "LAUNCHED", launchedAt: new Date() },
  });
  await event(review.id, me.id, "LAUNCHED", `Fanned out ${reviewers.length} feedback requests.`);
  await notifyMany(
    reviewers.map((r) => r.reviewerId).filter((id) => id !== me.id),
    "FEEDBACK_REQUESTED",
    `Feedback requested for ${me.firstName} ${me.lastName}'s ${cycle.name} review`,
    "/feedback"
  );
  res.status(201).json({ id: updated.id, status: updated.status, launchedAt: updated.launchedAt });
});

// Build the list of 360 reviewers for an attorney
async function build360(attorney) {
  const list = [{ reviewerId: attorney.id, role: "SELF" }];
  if (attorney.managerId) list.push({ reviewerId: attorney.managerId, role: "MANAGER" });

  // Peers: same practice group, same manager, not self
  if (attorney.practiceGroupId) {
    const peers = await prisma.user.findMany({
      where: { practiceGroupId: attorney.practiceGroupId, role: "ATTORNEY", id: { not: attorney.id }, active: true },
      take: 3,
    });
    peers.forEach((p) => list.push({ reviewerId: p.id, role: "PEER" }));
  }
  // Subordinates: people who report to this attorney
  const subs = await prisma.user.findMany({ where: { managerId: attorney.id, active: true }, take: 3 });
  subs.forEach((s) => list.push({ reviewerId: s.id, role: "SUBORDINATE" }));

  // Client: one active client (in a real deployment, matched to the attorney's matters)
  const client = await prisma.user.findFirst({ where: { role: "CLIENT", active: true } });
  if (client) list.push({ reviewerId: client.id, role: "CLIENT" });

  return list;
}

// ── Manager saves draft summary / goals ──
router.patch("/:id/draft", requireAuth, requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const review = await prisma.performanceReview.findUnique({ where: { id: req.params.id } });
  if (!review) return res.status(404).json({ error: "Not found" });
  if (review.managerId !== req.user.id && req.user.role !== "ADMIN") return res.status(403).json({ error: "Not your report" });
  if (["FINALIZED", "APPROVED"].includes(review.status)) return res.status(409).json({ error: "Report is locked" });

  const { draftSummary } = req.body || {};
  const updated = await prisma.performanceReview.update({
    where: { id: review.id },
    data: { draftSummary, status: review.status === "LAUNCHED" || review.status === "NOT_STARTED" ? "DRAFT" : review.status },
  });
  await refreshScore(review.id);
  await event(review.id, req.user.id, "DRAFT_SAVED", null);
  res.json({ id: updated.id, status: "DRAFT" });
});

// ── State transitions ──
router.post("/:id/submit", requireAuth, requireRole("MANAGER", "ADMIN"), transition("IN_REVIEW", ["DRAFT", "LAUNCHED"], "submittedAt", "SUBMITTED"));
router.post("/:id/finalize", requireAuth, requireRole("MANAGER", "ADMIN"), transition("FINALIZED", ["IN_REVIEW", "DRAFT"], "finalizedAt", "FINALIZED"));
router.post("/:id/approve", requireAuth, requireRole("ADMIN", "MANAGER"), transition("APPROVED", ["FINALIZED"], "approvedAt", "APPROVED"));

// Send a report back down the chain (e.g. needs more work)
router.post("/:id/send-back", requireAuth, requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const review = await prisma.performanceReview.findUnique({ where: { id: req.params.id } });
  if (!review) return res.status(404).json({ error: "Not found" });
  if (review.status === "APPROVED") return res.status(409).json({ error: "Approved reports are immutable" });
  const updated = await prisma.performanceReview.update({ where: { id: review.id }, data: { status: "DRAFT" } });
  await event(review.id, req.user.id, "SENT_BACK", req.body?.note || null);
  res.json({ id: updated.id, status: updated.status });
});

function transition(toStatus, fromAllowed, stampField, action) {
  return async (req, res) => {
    const review = await prisma.performanceReview.findUnique({ where: { id: req.params.id } });
    if (!review) return res.status(404).json({ error: "Not found" });
    if (req.user.role === "MANAGER" && review.managerId !== req.user.id) return res.status(403).json({ error: "Not your report" });
    if (!fromAllowed.includes(review.status)) {
      return res.status(409).json({ error: `Cannot move from ${review.status} to ${toStatus}` });
    }
    // finalize requires a final summary
    let data = { status: toStatus, [stampField]: new Date() };
    if (toStatus === "FINALIZED") {
      const finalSummary = req.body?.finalSummary || review.finalSummary || review.draftSummary;
      if (!finalSummary) return res.status(400).json({ error: "A final summary is required to finalize" });
      data.finalSummary = finalSummary;
      await refreshScore(review.id);
    }
    const updated = await prisma.performanceReview.update({ where: { id: review.id }, data });
    await event(review.id, req.user.id, action, req.body?.note || null);

    // Notify the attorney of the state change.
    await notify(
      review.subjectId,
      toStatus === "APPROVED" ? "APPROVED" : "STATE_CHANGE",
      toStatus === "APPROVED" ? "Your performance review was approved and is ready to view" : `Your review moved to ${toStatus}`,
      `/reviews/${review.id}`
    );

    // On approval, refresh the attorney's AI memory profile (best-effort, never
    // blocks the response; AI is fully optional).
    if (toStatus === "APPROVED") {
      import("../lib/ai/memory.js")
        .then(({ refreshAttorneyMemory }) => refreshAttorneyMemory(review.subjectId, { actorId: req.user.id }))
        .catch((e) => console.error("memory refresh failed:", e.message));
    }

    res.json({ id: updated.id, status: updated.status });
  };
}

// Recompute & persist the composite score from submitted feedback
async function refreshScore(reviewId) {
  const reqs = await prisma.feedbackRequest.findMany({
    where: { reviewId, response: { isNot: null } },
    include: { response: { include: { ratings: { include: { competency: true } } } } },
  });
  const responses = reqs.map((r) => r.response).filter(Boolean);
  const score = computeOverallScore(responses);
  await prisma.performanceReview.update({ where: { id: reviewId }, data: { overallScore: score } });
  return score;
}

async function event(reviewId, actorId, action, note) {
  await prisma.reportEvent.create({ data: { reviewId, actorId, action, note } });
}

function pub(u) {
  return u ? { id: u.id, name: `${u.firstName} ${u.lastName}`, title: u.title, role: u.role, email: u.email } : null;
}

export default router;
