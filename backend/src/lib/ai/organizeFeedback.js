// Review Organizer: turns one reviewer's messy free-text 360 feedback into a
// clean, structured set of strengths / improvement bullets + themes. It only
// restructures and lightly clarifies what was written — it never invents content.

import { z } from "zod/v4"; // SDK's zodOutputFormat requires zod v4 schemas
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { client, model, logRun } from "./client.js";

const Schema = z.object({
  strengths: z.array(z.string()).describe("Clear, concrete strength bullet points"),
  improvements: z.array(z.string()).describe("Specific, actionable areas to improve"),
  themes: z.array(z.string()).describe("Short cross-cutting themes (1-3 words each)"),
});

// raw: { strengths, improvements, ratings: [{ competency, score }] }
export async function organizeFeedback(raw, { actorId, refId } = {}) {
  const c = client();
  if (!c) return null;

  const ratingLines = (raw.ratings || [])
    .map((r) => `- ${r.competency}: ${r.score}/5`)
    .join("\n");

  const prompt = `You are organizing one reviewer's 360 feedback about an attorney into a clear, structured form for a performance report. Do not invent content; only restructure and lightly clarify what is given. Keep it professional and specific.

RATINGS:
${ratingLines || "(none)"}

STRENGTHS (free text):
${raw.strengths || "(none provided)"}

AREAS TO IMPROVE (free text):
${raw.improvements || "(none provided)"}`;

  const res = await c.messages.parse({
    model: model(),
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(Schema) },
  });

  await logRun({ kind: "ORGANIZE", refId, actorId, usage: res.usage });
  return res.parsed_output ?? res.parsed ?? null;
}
