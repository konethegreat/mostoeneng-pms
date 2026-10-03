// Attorney Memory: a persistent, AI-maintained longitudinal profile built from
// an attorney's APPROVED reports. Refreshed automatically when a report is
// approved, and fed into the Report Draft Assistant so reviews build on history.

import { z } from "zod/v4"; // SDK's zodOutputFormat requires zod v4 schemas
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "../prisma.js";
import { client, model, logRun, aiEnabled } from "./client.js";

const Schema = z.object({
  summary: z.string().describe("2-3 sentence overall profile"),
  themes: z.array(z.string()).describe("Recurring themes across cycles"),
  strengths: z.string().describe("Durable strengths"),
  risks: z.string().describe("Watch areas / recurring development needs"),
  trajectory: z.string().describe("Performance direction over time"),
});

// Returns the upserted AttorneyMemory row, or null if AI is off / no history.
export async function refreshAttorneyMemory(attorneyId, { actorId } = {}) {
  if (!aiEnabled()) return null;
  const c = client();
  const attorney = await prisma.user.findUnique({ where: { id: attorneyId } });
  if (!attorney) return null;

  const approved = await prisma.performanceReview.findMany({
    where: { subjectId: attorneyId, status: "APPROVED" },
    include: { cycle: true },
    orderBy: { approvedAt: "asc" },
  });
  if (approved.length === 0) return null;

  const history = approved
    .map((r) => `${r.cycle.name}: score ${r.overallScore ?? "-"}/5\n  ${r.finalSummary || "(no summary)"}`)
    .join("\n\n");

  const res = await c.messages.parse({
    model: model(),
    max_tokens: 1200,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `Build a concise longitudinal profile of attorney ${attorney.firstName} ${attorney.lastName} from their approved performance reports. Capture recurring themes, durable strengths, watch areas, and the trajectory across cycles. Be factual and fair; base everything on the reports below.

APPROVED REPORTS (oldest first):
${history}`,
      },
    ],
    output_config: { format: zodOutputFormat(Schema) },
  });

  await logRun({ kind: "MEMORY", refId: attorneyId, actorId, usage: res.usage });
  const m = res.parsed_output ?? res.parsed ?? null;
  if (!m) return null;

  const data = {
    summary: m.summary,
    themes: JSON.stringify(m.themes),
    strengths: m.strengths,
    risks: m.risks,
    trajectory: m.trajectory,
    lastCycleId: approved[approved.length - 1].cycleId,
  };
  return prisma.attorneyMemory.upsert({
    where: { attorneyId },
    update: data,
    create: { attorneyId, ...data },
  });
}
