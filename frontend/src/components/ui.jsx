// Small presentational helpers shared across pages — kept dependency-free.

export function StatusPill({ status }) {
  const map = {
    NOT_STARTED: ["Not started", "grey"],
    LAUNCHED: ["Collecting feedback", "blue"],
    DRAFT: ["Draft", "amber"],
    IN_REVIEW: ["In review", "amber"],
    FINALIZED: ["Finalized", "violet"],
    APPROVED: ["Approved", "green"],
    PENDING: ["Pending", "amber"],
    SUBMITTED: ["Submitted", "green"],
  };
  const [label, tone] = map[status] || [status, "grey"];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export function ScoreBadge({ score }) {
  if (score == null) return <span className="score muted">—</span>;
  const tone = score >= 4 ? "green" : score >= 3 ? "amber" : "red";
  return <span className={`score ${tone}`}>{score.toFixed(2)}<small>/5</small></span>;
}

export function Bar({ label, value, max = 5 }) {
  const pct = value == null ? 0 : Math.round((value / max) * 100);
  const tone = value >= 4 ? "green" : value >= 3 ? "amber" : "red";
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-value">{value == null ? "—" : value.toFixed(1)}</span>
    </div>
  );
}

export function ProgressRing({ pct, label }) {
  const tone = pct >= 80 ? "green" : pct >= 50 ? "amber" : "red";
  return (
    <div className="ring-wrap">
      <div className={`ring ${tone}`} style={{ "--pct": pct }}>
        <span>{pct}%</span>
      </div>
      {label && <small>{label}</small>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="stat">
      <div className={`stat-value ${tone || ""}`}>{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export const sourceLabel = {
  SELF: "Self", MANAGER: "Manager", PEER: "Peers", SUBORDINATE: "Subordinates", CLIENT: "Client",
};
