import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute, textProblem, LIMITS } from "../lib/http.js";

const router = Router();

// Default per-source confidence weights applied when feedback is submitted.
const SOURCE_WEIGHT = { SELF: 0.8, MANAGER: 1.5, PEER: 1.0, SUBORDINATE: 1.0, CLIENT: 0.9 };

// Feedback is collected from launch until the report is finalized; sending the
// report back to draft reopens it.
const OPEN_STATUSES = ["LAUNCHED", "DRAFT", "IN_REVIEW"];
const isOpen = (review) => OPEN_STATUSES.includes(review.status);

// ── Feedback I owe (any role, incl. self-review & client portal) ──
router.get("/mine", requireAuth, asyncRoute(async (req, res) => {
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
    open: isOpen(r.review),
    subject: { id: r.review.subject.id, name: `${r.review.subject.firstName} ${r.review.subject.lastName}`, title: r.review.subject.title },
    cycle: { id: r.review.cycle.id, name: r.review.cycle.name },
    isSelf: r.reviewerRole === "SELF",
  })));
}));

// ── Get one request + competency framework (to render the form) ──
router.get("/request/:id", requireAuth, asyncRoute(async (req, res) => {
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
    open: isOpen(request.review),
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
}));

// ── Submit (or resubmit) feedback ──
// body: { ratings: [{competencyId, score, comment}], strengths, improvements }
router.post("/request/:id", requireAuth, asyncRoute(async (req, res) => {
  const request = await prisma.feedbackRequest.findUnique({ where: { id: req.params.id }, include: { review: true } });
  if (!request) return res.status(404).json({ error: "Not found" });
  if (request.reviewerId !== req.user.id) return res.status(403).json({ error: "Not your feedback request" });
  if (!isOpen(request.review)) {
    return res.status(409).json({ error: request.review.launchedAt ? "Feedback is closed for this report" : "This review has not been launched" });
  }

  const { ratings, strengths, improvements } = req.body || {};
  const problem = await ratingsProblem(ratings)
    || textProblem(strengths, "strengths", LIMITS.feedback)
    || textProblem(improvements, "improvements", LIMITS.feedback);
  if (problem) return res.status(400).json({ error: problem });

  const sourceWeight = SOURCE_WEIGHT[request.reviewerRole] ?? 1.0;

  // Replace the response and its ratings together, so a failed resubmission can
  // never leave the request SUBMITTED with its earlier ratings deleted.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.feedbackResponse.findUnique({ where: { requestId: request.id } });
    let response;
    if (existing) {
      await tx.rating.deleteMany({ where: { responseId: existing.id } });
      response = await tx.feedbackResponse.update({
        where: { id: existing.id },
        data: { strengths, improvements, sourceWeight, organized: null }, // stale AI structure invalidated
      });
    } else {
      response = await tx.feedbackResponse.create({
        data: { requestId: request.id, strengths, improvements, sourceWeight },
      });
    }
    await tx.rating.createMany({
      data: ratings.map((r) => ({ responseId: response.id, competencyId: r.competencyId, score: r.score, comment: r.comment || null })),
    });
    await tx.feedbackRequest.update({ where: { id: request.id }, data: { status: "SUBMITTED" } });
  });

  res.status(201).json({ ok: true, requestId: request.id });
}));

// Each rating needs a distinct active competency and a whole-number score 1-5.
async function ratingsProblem(ratings) {
  if (!Array.isArray(ratings) || ratings.length === 0) return "ratings required";
  const ids = new Set();
  for (const r of ratings) {
    if (!r || typeof r.competencyId !== "string" || !Number.isInteger(r.score) || r.score < 1 || r.score > 5) {
      return "Each rating needs competencyId and a whole-number score 1-5";
    }
    if (ids.has(r.competencyId)) return "Each competency can be rated only once";
    ids.add(r.competencyId);
    const commentProblem = textProblem(r.comment, "comment", LIMITS.comment);
    if (commentProblem) return commentProblem;
  }
  const known = await prisma.competency.count({ where: { id: { in: [...ids] }, active: true } });
  return known === ids.size ? null : "Ratings must reference active competencies";
}

export default router;
