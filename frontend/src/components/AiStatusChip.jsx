// Top-bar indicator showing whether AI is active and which model is in use.
// Never shows the API key — only the model the server reports via /api/ai/status.
import { useAiStatus } from "../hooks/useAiStatus.js";

const FRIENDLY = {
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-fable-5": "Fable 5",
};

export function AiStatusChip() {
  const { aiEnabled, model } = useAiStatus();
  const label = aiEnabled ? (FRIENDLY[model] || model) : "AI off";
  return (
    <span
      className={`ai-chip ${aiEnabled ? "on" : "off"}`}
      title={aiEnabled ? `AI active — model: ${model}` : "AI not configured (set ANTHROPIC_API_KEY in backend/.env)"}
    >
      ✦ {label}
    </span>
  );
}
