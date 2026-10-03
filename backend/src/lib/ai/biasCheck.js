// Bias & Quality Check: runs on draft feedback *before* it is submitted and
// flags vague, non-actionable, or potentially-biased phrasing with concrete
// rewrite suggestions. Advisory only — it never blocks submission.

import { z } from "zod/v4"; // SDK's zodOutputFormat requires zod v4 schemas
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, model, logRun } from "./client.js";

const Schema = z.object({
  flags: z.array(
    z.object({
      quote: z.string().describe("The exact phrase from the feedback"),
      type: z.enum(["vague", "non_actionable", "potentially_biased"]),
      suggestion: z.string().describe("A concrete, behavior-based rewrite suggestion"),
    })
  ),
  specificityScore: z.number().min(1).max(5).describe("Overall specificity, 1 (vague) to 5 (precise)"),
  summary: z.string().describe("One-sentence overall assessment"),
});

export async function biasCheck({ strengths, improvements }, { actorId, refId } = {}) {
  const c = client();
  if (!c) return null;

  const prompt = `You review draft 360 performance feedback for quality and fairness before it is submitted. Identify phrases that are vague, non-actionable, or potentially biased (e.g. about personality, gender, age, or traits unrelated to the work). For each, suggest a concrete, behavior-based rewrite. Rate overall specificity 1-5. Be constructive and brief. If the feedback is already strong, return an empty flags array.

STRENGTHS:
${strengths || "(none)"}

AREAS TO IMPROVE:
${improvements || "(none)"}`;

  const res = await c.messages.parse({
    model: model(),
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(Schema) },
  });

  await logRun({ kind: "BIAS_CHECK", refId, actorId, usage: res.usage });
  return res.parsed_output ?? res.parsed ?? null;
}
