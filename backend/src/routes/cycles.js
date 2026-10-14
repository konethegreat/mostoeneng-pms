import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncRoute, LIMITS } from "../lib/http.js";

const router = Router();
const TYPES = ["QUARTERLY", "ANNUAL"];

router.get("/", requireAuth, asyncRoute(async (_req, res) => {
  const cycles = await prisma.reviewCycle.findMany({
    orderBy: { periodStart: "desc" },
    include: { _count: { select: { reviews: true } }, children: true },
  });
  res.json(cycles);
}));

// Admin creates a cycle. Only a quarterly cycle may roll up into an annual one;
// the annual rollup reads approved quarterly reviews from its children.
router.post("/", requireAuth, requireRole("ADMIN"), asyncRoute(async (req, res) => {
  const { name, type, periodStart, periodEnd, slaDays, parentId } = req.body || {};
  const label = typeof name === "string" ? name.trim() : "";
  if (!label || !type || !periodStart || !periodEnd) {
    return res.status(400).json({ error: "name, type, periodStart, periodEnd required" });
  }
  if (label.length > LIMITS.cycleName) return res.status(400).json({ error: `name must be ${LIMITS.cycleName} characters or fewer` });
  if (!TYPES.includes(type)) return res.status(400).json({ error: "type must be QUARTERLY or ANNUAL" });
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return res.status(400).json({ error: "periodStart and periodEnd must be valid dates, with the end after the start" });
  }
  const sla = slaDays ?? 30;
  if (!Number.isInteger(sla) || sla < 1 || sla > 365) {
    return res.status(400).json({ error: "slaDays must be a whole number from 1 to 365" });
  }
  let parent = null;
  if (parentId) {
    if (type !== "QUARTERLY") return res.status(400).json({ error: "Only a quarterly cycle can roll up into an annual cycle" });
    if (typeof parentId === "string") parent = await prisma.reviewCycle.findUnique({ where: { id: parentId } });
    if (parent?.type !== "ANNUAL") return res.status(400).json({ error: "parentId must reference an annual cycle" });
  }
  try {
    const cycle = await prisma.reviewCycle.create({
      data: { name: label, type, periodStart: start, periodEnd: end, slaDays: sla, parentId: parent?.id ?? null },
    });
    res.status(201).json(cycle);
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "A cycle with this name and type already exists" });
    throw e;
  }
}));

router.patch("/:id/close", requireAuth, requireRole("ADMIN"), asyncRoute(async (req, res) => {
  const existing = await prisma.reviewCycle.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const cycle = await prisma.reviewCycle.update({ where: { id: existing.id }, data: { status: "CLOSED" } });
  res.json(cycle);
}));

export default router;
