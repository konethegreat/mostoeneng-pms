import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return res.status(401).json({ error: "Invalid credentials" });

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { practiceGroup: true, manager: true },
  });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user: publicUser(user) });
});

function publicUser(u) {
  return {
    id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
    role: u.role, title: u.title, practiceGroupId: u.practiceGroupId,
    managerId: u.managerId, clientAccount: u.clientAccount,
    practiceGroup: u.practiceGroup ? { id: u.practiceGroup.id, name: u.practiceGroup.name } : undefined,
  };
}

export default router;
