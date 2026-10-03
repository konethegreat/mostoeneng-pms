import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// List people. Managers/admins see their team / everyone; attorneys see colleagues (names only).
router.get("/", requireAuth, async (req, res) => {
  const where = { active: true };
  if (req.user.role === "MANAGER") {
    // their direct reports + themselves
    where.OR = [{ managerId: req.user.id }, { id: req.user.id }];
  }
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
    include: { practiceGroup: true },
  });
  res.json(users.map(slim));
});

// Competency framework (used by feedback forms)
router.get("/competencies", requireAuth, async (_req, res) => {
  const comps = await prisma.competency.findMany({ where: { active: true }, orderBy: { order: "asc" } });
  res.json(comps);
});

// Practice groups
router.get("/groups", requireAuth, async (_req, res) => {
  const groups = await prisma.practiceGroup.findMany({ include: { head: true, members: true } });
  res.json(groups.map((g) => ({
    id: g.id, name: g.name,
    head: g.head ? slim(g.head) : null,
    memberCount: g.members.length,
  })));
});

function slim(u) {
  return {
    id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
    role: u.role, title: u.title, managerId: u.managerId,
    practiceGroup: u.practiceGroup ? u.practiceGroup.name : null,
  };
}

export default router;
