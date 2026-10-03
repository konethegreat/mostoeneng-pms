// Small "AI-assisted" label used wherever AI output is shown — a human always
// owns the final decision, so we never present AI text as authoritative.
export function AiBadge({ label = "AI-assisted" }) {
  return <span className="ai-badge">✦ {label}</span>;
}
