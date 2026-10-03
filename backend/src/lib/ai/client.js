// Anthropic AI client + small helpers shared by every AI feature.
//
// The whole AI layer is optional: if AI_ENABLED is "false" or there is no
// ANTHROPIC_API_KEY, aiEnabled() returns false and callers must degrade
// gracefully (return { aiEnabled: false } rather than erroring). The API key
// never leaves the server.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma.js";

let _client = null;

export function aiEnabled() {
  return process.env.AI_ENABLED !== "false" && !!process.env.ANTHROPIC_API_KEY;
}

export function model() {
  return process.env.AI_MODEL || "claude-opus-4-8";
}

// Lazily construct a single Anthropic client (reads ANTHROPIC_API_KEY from env).
export function client() {
  if (!aiEnabled()) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

// Records an AiRun audit row from a message response's usage block.
// Never throws — auditing must not break the feature it is logging.
export async function logRun({ kind, refId, actorId, usage }) {
  try {
    await prisma.aiRun.create({
      data: {
        kind,
        model: model(),
        refId: refId || null,
        actorId: actorId || null,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
      },
    });
  } catch (e) {
    console.error("AiRun log failed:", e.message);
  }
}
