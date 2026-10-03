// Zoho-style recent activity feed, fed by /api/activity (role-scoped audit events).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { Empty } from "./Empty.jsx";

const VERB = {
  LAUNCHED: "launched a review",
  DRAFT_SAVED: "saved a draft",
  SUBMITTED: "submitted for review",
  FINALIZED: "finalized the report",
  APPROVED: "approved the report",
  SENT_BACK: "sent the report back",
  FEEDBACK_REQUESTED: "requested feedback",
  STATE_CHANGE: "updated the review",
};

export function ActivityFeed() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get("/activity").then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="card">
      <div className="card-head"><h2>Recent activity</h2></div>
      {!items && <p className="loading">Loading…</p>}
      {items && items.length === 0 && (
        <Empty title="No recent activity" hint="Actions across your reviews will appear here." />
      )}
      {items && items.map((it) => (
        <Link to={it.link || "#"} key={it.id} className="activity-item">
          <span className="activity-dot" />
          <div>
            {it.actor ? (
              <span><strong>{it.actor}</strong> {VERB[it.action] || it.action.toLowerCase()}{it.subject ? <> · {it.subject}</> : null}{it.cycle ? <span className="muted"> ({it.cycle})</span> : null}</span>
            ) : (
              <span>{it.text}</span>
            )}
            <small>{new Date(it.at).toLocaleString()}</small>
          </div>
        </Link>
      ))}
    </div>
  );
}
