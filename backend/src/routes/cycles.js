import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const cycles = await prisma.reviewCycle.findMany({
    orderBy: { periodStart: "desc" },
    include: { _count: { select: { reviews: true } }, children: true },
  });
  res.json(cycles);
});

// Admin creates a cycle
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name, type, periodStart, periodEnd, slaDays, parentId } = req.body || {};
  if (!name || !type || !periodStart || !periodEnd) {
    return res.status(400).json({ error: "name, type, periodStart, periodEnd required" });
  }
  try {
    const cycle = await prisma.reviewCycle.create({
      data: {
        name, type,
        periodStart: new Date(periodStart), periodEnd: new Date(periodEnd),
        slaDays: slaDays ?? 30, parentId: parentId || null,
      },
    });
    res.status(201).json(cycle);
  } catch (e) {
    res.status(400).json({ error: "Could not create cycle (duplicate name/type?)", detail: e.message });
  }
});

router.patch("/:id/close", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const cycle = await prisma.reviewCycle.update({ where: { id: req.params.id }, data: { status: "CLOSED" } });
  res.json(cycle);
});

export default router;
