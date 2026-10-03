// Report Draft Assistant: writes a manager-editable narrative summary from the
// submitted 360 feedback plus the attorney's memory profile. Streamed
// server-side (avoids HTTP timeouts), then returned as full text. The manager
// always edits and approves — this is a draft, never a final word.

import { client, model, logRun } from "./client.js";

// review: includes subject, cycle, requests -> response -> ratings -> competency
// memory: AttorneyMemory | null
export async function draftReport(review, memory, { actorId } = {}) {
  const c = client();
  if (!c) return null;

  const fb = review.requests
    .filter((r) => r.response)
    .map((r) => {
      const ratings = r.response.ratings.map((x) => `${x.competency.name}: ${x.score}/5`).join(", ");
      return `[${r.reviewerRole}] ${ratings}\n  Strengths: ${r.response.strengths || "-"}\n  Improve: ${r.response.improvements || "-"}`;
    })
    .join("\n\n");

  const mem = memory
    ? `PRIOR PROFILE (from past cycles):\nTrajectory: ${memory.trajectory || "-"}\nThemes: ${memory.themes || "-"}\nStrengths: ${memory.strengths || "-"}\nWatch areas: ${memory.risks || "-"}`
    : "No prior profile on record.";

  const prompt = `Write a balanced, professional performance-review narrative for ${review.subject.firstName} ${review.subject.lastName} (${review.subject.title || "attorney"}) for ${review.cycle.name}. Use the 360 feedback and the prior profile. Structure as 3-4 short paragraphs: overall performance, key strengths, development areas, and a forward-looking note. Be specific and fair; do not fabricate facts. This is a draft a manager will edit, so write in a confident editorial voice without hedging boilerplate.

${mem}

360 FEEDBACK:
${fb || "(no feedback submitted yet)"}`;

  const stream = c.messages.stream({
    model: model(),
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });
  const final = await stream.finalMessage();
  const text = final.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  await logRun({ kind: "DRAFT", refId: review.id, actorId, usage: final.usage });
  return text;
}
