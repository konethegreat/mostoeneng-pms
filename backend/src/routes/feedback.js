import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Default per-source confidence weights applied when feedback is submitted.
const SOURCE_WEIGHT = { SELF: 0.8, MANAGER: 1.5, PEER: 1.0, SUBORDINATE: 1.0, CLIENT: 0.9 };

// ── Feedback I owe (any role, incl. self-review & client portal) ──
router.get("/mine", requireAuth, async (req, res) => {
  const requests = await prisma.feedbackRequest.findMany({
    where: { reviewerId: req.user.id },
    include: {
      response: true,
      review: { include: { subject: true, cycle: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  res.json(requests.map((r) => ({
    id: r.id,
    reviewerRole: r.reviewerRole,
    status: r.status,
    dueDate: r.dueDate,
    submitted: !!r.response,
    subject: { id: r.review.subject.id, name: `${r.review.subject.firstName} ${r.review.subject.lastName}`, title: r.review.subject.title },
    cycle: { id: r.review.cycle.id, name: r.review.cycle.name },
    isSelf: r.reviewerRole === "SELF",
  })));
});

// ── Get one request + competency framework (to render the form) ──
router.get("/request/:id", requireAuth, async (req, res) => {
  const request = await prisma.feedbackRequest.findUnique({
    where: { id: req.params.id },
    include: {
      review: { include: { subject: true, cycle: true } },
      response: { include: { ratings: true } },
    },
  });
  if (!request) return res.status(404).json({ error: "Not found" });
  if (request.reviewerId !== req.user.id) return res.status(403).json({ error: "Not your feedback request" });

  const competencies = await prisma.competency.findMany({ where: { active: true }, orderBy: { order: "asc" } });
  res.json({
    id: request.id,
    reviewerRole: request.reviewerRole,
    status: request.status,
    dueDate: request.dueDate,
    subject: { id: request.review.subject.id, name: `${request.review.subject.firstName} ${request.review.subject.lastName}`, title: request.review.subject.title },
    cycle: { id: request.review.cycle.id, name: request.review.cycle.name },
    competencies,
    existing: request.response
      ? {
          strengths: request.response.strengths,
          improvements: request.response.improvements,
          ratings: request.response.ratings.map((r) => ({ competencyId: r.competencyId, score: r.score, comment: r.comment })),
        }
      : null,
  });
});

// ── Submit (or resubmit) feedback ──
// body: { ratings: [{competencyId, score, comment}], strengths, improvements }
router.post("/request/:id", requireAuth, async (req, res) => {
  const request = await prisma.feedbackRequest.findUnique({ where: { id: req.params.id }, include: { review: true } });
  if (!request) return res.status(404).json({ error: "Not found" });
  if (request.reviewerId !== req.user.id) return res.status(403).json({ error: "Not your feedback request" });
  if (request.review.status === "APPROVED") return res.status(409).json({ error: "Cycle closed for this report" });

  const { ratings, strengths, improvements } = req.body || {};
  if (!Array.isArray(ratings) || ratings.length === 0) return res.status(400).json({ error: "ratings required" });
  for (const r of ratings) {
    if (!r.competencyId || typeof r.score !== "number" || r.score < 1 || r.score > 5) {
      return res.status(400).json({ error: "Each rating needs competencyId and a score 1-5" });
    }
  }

  const sourceWeight = SOURCE_WEIGHT[request.reviewerRole] ?? 1.0;

  // Upsert response, replace ratings
  const existing = await prisma.feedbackResponse.findUnique({ where: { requestId: request.id } });
  let response;
  if (existing) {
    await prisma.rating.deleteMany({ where: { responseId: existing.id } });
    response = await prisma.feedbackResponse.update({
      where: { id: existing.id },
      data: { strengths, improvements, sourceWeight, organized: null }, // stale AI structure invalidated
    });
  } else {
    response = await prisma.feedbackResponse.create({
      data: { requestId: request.id, strengths, improvements, sourceWeight },
    });
  }
  await prisma.rating.createMany({
    data: ratings.map((r) => ({ responseId: response.id, competencyId: r.competencyId, score: r.score, comment: r.comment || null })),
  });
  await prisma.feedbackRequest.update({ where: { id: request.id }, data: { status: "SUBMITTED" } });

  res.status(201).json({ ok: true, requestId: request.id });
});

export default router;
