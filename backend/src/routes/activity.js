// Recent activity feed, role-scoped: the audit events (ReportEvent) for reviews
// the user is involved in. Clients (who don't own reviews) get their own
// notifications as their activity stream.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const role = req.user.role;

  if (role === "CLIENT") {
    const notes = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    return res.json(notes.map((n) => ({ id: n.id, action: n.type, text: n.message, at: n.createdAt, link: n.link })));
  }

  let reviewWhere = {};
  if (role === "ATTORNEY") reviewWhere = { subjectId: req.user.id };
  else if (role === "MANAGER") reviewWhere = { managerId: req.user.id };
  // ADMIN: all reviews

  const events = await prisma.reportEvent.findMany({
    where: { review: reviewWhere },
    include: { actor: true, review: { include: { subject: true, cycle: true } } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  res.json(events.map((e) => ({
    id: e.id,
    action: e.action,
    actor: `${e.actor.firstName} ${e.actor.lastName}`,
    subject: `${e.review.subject.firstName} ${e.review.subject.lastName}`,
    cycle: e.review.cycle.name,
    at: e.createdAt,
    link: `/reviews/${e.reviewId}`,
  })));
});

export default router;
