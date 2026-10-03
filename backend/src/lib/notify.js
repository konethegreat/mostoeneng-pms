// Tiny helper for writing in-app Notification rows. Best-effort: a failed
// notification must never break the action that triggered it.

import { prisma } from "./prisma.js";

export async function notify(userId, type, message, link) {
  try {
    await prisma.notification.create({ data: { userId, type, message, link: link || null } });
  } catch (e) {
    console.error("notify failed:", e.message);
  }
}

export async function notifyMany(userIds, type, message, link) {
  await Promise.all([...new Set(userIds)].map((id) => notify(id, type, message, link)));
}
