import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Current user's notifications (newest first) + unread count.
router.get("/", requireAuth, async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ items, unread: items.filter((n) => !n.read).length });
});

router.post("/:id/read", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { read: true },
  });
  res.json({ ok: true });
});

router.post("/read-all", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

export default router;
