// AI feature endpoints. Every route degrades gracefully when AI is not
// configured (returns { aiEnabled: false } instead of erroring), and every
// handler is wrapped in `safe` so an AI/network failure returns a clean error
// rather than crashing the process (Express 4 does not catch async rejections).

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { aiEnabled, model } from "../lib/ai/client.js";
import { organizeFeedback } from "../lib/ai/organizeFeedback.js";
import { biasCheck } from "../lib/ai/biasCheck.js";
import { draftReport } from "../lib/ai/draftReport.js";
import { refreshAttorneyMemory } from "../lib/ai/memory.js";

const router = Router();

// Catch async errors so a failed AI call returns 502 JSON instead of killing
// the server. The frontend surfaces `error` as a toast.
const safe = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error("AI route error:", e?.message || e);
    if (!res.headersSent) res.status(502).json({ error: "AI request failed", detail: e?.message || String(e) });
  });

function canSeeMemory(user, attorneyId, managerId) {
  return user.role === "ADMIN" || user.id === attorneyId || user.id === managerId;
}

const DRAFT_INCLUDE = {
  subject: true,
  cycle: true,
  requests: { include: { response: { include: { ratings: { include: { competency: true } } } } } },
};

// Lets the frontend show/hide AI affordances and pick copy.
router.get("/status", requireAuth, (_req, res) => {
  res.json({ aiEnabled: aiEnabled(), model: aiEnabled() ? model() : null });
});

// ── Review Organizer: structure one submitted feedback response ──
router.post("/organize/:requestId", requireAuth, safe(async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const request = await prisma.feedbackRequest.findUnique({
    where: { id: req.params.requestId },
    include: { review: true, response: { include: { ratings: { include: { competency: true } } } } },
  });
  if (!request || !request.response) return res.status(404).json({ error: "No feedback to organize" });

  const isOwner = request.reviewerId === req.user.id;
  const isManager = request.review.managerId === req.user.id;
  if (!isOwner && !isManager && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const raw = {
    strengths: request.response.strengths,
    improvements: request.response.improvements,
    ratings: request.response.ratings.map((r) => ({ competency: r.competency.name, score: r.score })),
  };
  const organized = await organizeFeedback(raw, { actorId: req.user.id, refId: request.id });
  if (!organized) return res.json({ aiEnabled: false });

  await prisma.feedbackResponse.update({
    where: { id: request.response.id },
    data: { organized: JSON.stringify(organized) },
  });
  res.json({ aiEnabled: true, organized });
}));

// ── Bias & Quality Check: advisory review of draft feedback before submit ──
router.post("/bias-check", requireAuth, safe(async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const { strengths, improvements } = req.body || {};
  if (!strengths && !improvements) return res.status(400).json({ error: "Nothing to check" });
  const result = await biasCheck({ strengths, improvements }, { actorId: req.user.id });
  if (!result) return res.json({ aiEnabled: false });
  res.json({ aiEnabled: true, ...result });
}));

// ── Report Draft Assistant: AI-drafted narrative for the owning manager ──
router.post("/reviews/:id/draft", requireAuth, safe(async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const review = await prisma.performanceReview.findUnique({
    where: { id: req.params.id },
    include: DRAFT_INCLUDE,
  });
  if (!review) return res.status(404).json({ error: "Not found" });
  if (review.managerId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Not your report" });
  }
  const memory = await prisma.attorneyMemory.findUnique({ where: { attorneyId: review.subjectId } });
  const text = await draftReport(review, memory, { actorId: req.user.id });
  if (text == null) return res.json({ aiEnabled: false });

  await prisma.performanceReview.update({ where: { id: review.id }, data: { aiDraftSummary: text } });
  res.json({ aiEnabled: true, draft: text });
}));

// ── Attorney Memory: read profile ──
router.get("/attorneys/:id/memory", requireAuth, safe(async (req, res) => {
  const attorney = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!attorney) return res.status(404).json({ error: "Not found" });
  if (!canSeeMemory(req.user, attorney.id, attorney.managerId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const memory = await prisma.attorneyMemory.findUnique({ where: { attorneyId: attorney.id } });
  res.json({ aiEnabled: aiEnabled(), memory });
}));

// ── Attorney Memory: regenerate on demand (admin, or the attorney's manager) ──
router.post("/attorneys/:id/memory/refresh", requireAuth, safe(async (req, res) => {
  if (!aiEnabled()) return res.json({ aiEnabled: false });
  const attorney = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!attorney) return res.status(404).json({ error: "Not found" });
  // Row-level scope: ADMIN may refresh anyone; a MANAGER only their own reports.
  if (!(req.user.role === "ADMIN" || attorney.managerId === req.user.id)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const memory = await refreshAttorneyMemory(attorney.id, { actorId: req.user.id });
  res.json({ aiEnabled: true, memory });
}));

export default router;
