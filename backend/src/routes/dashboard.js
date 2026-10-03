import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { completionRate, cycleTime, computeOverallScore, competencyBreakdown } from "../lib/scoring.js";

const router = Router();

// ── Manager / admin dashboard: team-wide rollups ──
router.get("/manager", requireAuth, async (req, res) => {
  if (!["MANAGER", "ADMIN"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });

  const where = req.user.role === "ADMIN" ? {} : { managerId: req.user.id };
  const reviews = await prisma.performanceReview.findMany({
    where,
    include: { subject: true, cycle: true, requests: true },
    orderBy: { updatedAt: "desc" },
  });

  let totalReq = 0, totalSub = 0, overdue = 0;
  const cycleTimes = [];
  const rows = reviews.map((r) => {
    const comp = completionRate(r.requests);
    const ct = cycleTime(r, r.cycle.slaDays);
    totalReq += comp.total; totalSub += comp.submitted;
    if (ct.overdue) overdue += 1;
    if (ct.completed) cycleTimes.push(ct.elapsedDays);
    return {
      reviewId: r.id, status: r.status, overallScore: r.overallScore,
      subject: `${r.subject.firstName} ${r.subject.lastName}`, title: r.subject.title,
      cycle: r.cycle.name,
      completionPct: comp.pct, completion: comp,
      elapsedDays: ct.elapsedDays ?? null, overdue: ct.overdue ?? false,
      launchedAt: r.launchedAt, approvedAt: r.approvedAt,
    };
  });

  const statusCounts = {};
  reviews.forEach((r) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  res.json({
    summary: {
      reviewCount: reviews.length,
      avgScore: avg(reviews.map((r) => r.overallScore).filter((s) => s != null)),
      completionPct: totalReq ? Math.round((totalSub / totalReq) * 100) : 0,
      overdueCount: overdue,
      avgCycleDays: cycleTimes.length ? Math.round(avg(cycleTimes)) : null,
    },
    statusCounts,
    reviews: rows,
  });
});

// ── Attorney dashboard: my own performance ──
router.get("/attorney", requireAuth, async (req, res) => {
  const reviews = await prisma.performanceReview.findMany({
    where: { subjectId: req.user.id },
    include: {
      cycle: true,
      requests: { include: { response: { include: { ratings: { include: { competency: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Open cycles where I have NOT launched yet -> the launch button targets
  const openCycles = await prisma.reviewCycle.findMany({ where: { status: "OPEN" } });
  const myCycleIds = new Set(reviews.filter((r) => r.launchedAt).map((r) => r.cycleId));
  const launchable = openCycles.filter((c) => !myCycleIds.has(c.id));

  const cards = reviews.map((r) => {
    const responses = r.requests.map((q) => q.response).filter(Boolean);
    return {
      reviewId: r.id, status: r.status, cycle: r.cycle.name, cycleType: r.cycle.type,
      launchedAt: r.launchedAt, approvedAt: r.approvedAt,
      finalSummary: r.status === "APPROVED" ? r.finalSummary : null, // attorney sees summary only once approved
      overallScore: r.status === "APPROVED" ? r.overallScore : null,
      completion: completionRate(r.requests),
      cycleTime: cycleTime(r, r.cycle.slaDays),
      byCompetency: r.status === "APPROVED" ? competencyBreakdown(responses) : null,
    };
  });

  // Trend across approved reviews (for a sparkline)
  const trend = reviews
    .filter((r) => r.status === "APPROVED" && r.overallScore != null)
    .sort((a, b) => new Date(a.cycle.periodStart) - new Date(b.cycle.periodStart))
    .map((r) => ({ cycle: r.cycle.name, score: r.overallScore }));

  res.json({ launchable, cards, trend });
});

// ── Annual rollup: average the child (quarterly) approved reports ──
router.get("/rollup/:attorneyId/:annualCycleId", requireAuth, async (req, res) => {
  if (!["MANAGER", "ADMIN"].includes(req.user.role) && req.user.id !== req.params.attorneyId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const annual = await prisma.reviewCycle.findUnique({ where: { id: req.params.annualCycleId }, include: { children: true } });
  if (!annual) return res.status(404).json({ error: "Annual cycle not found" });

  const childIds = annual.children.map((c) => c.id);
  const childReviews = await prisma.performanceReview.findMany({
    where: { subjectId: req.params.attorneyId, cycleId: { in: childIds }, status: "APPROVED" },
    include: { cycle: true },
  });

  const scores = childReviews.map((r) => r.overallScore).filter((s) => s != null);
  res.json({
    annualCycle: annual.name,
    quarters: childReviews.map((r) => ({ cycle: r.cycle.name, score: r.overallScore, summary: r.finalSummary, approvedAt: r.approvedAt })),
    annualScore: scores.length ? Math.round(avg(scores) * 100) / 100 : null,
    quartersComplete: childReviews.length,
    quartersTotal: childIds.length,
  });
});

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

export default router;
