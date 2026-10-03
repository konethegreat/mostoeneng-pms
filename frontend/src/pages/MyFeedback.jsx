import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { StatusPill, sourceLabel } from "../components/ui.jsx";

export default function MyFeedback() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/feedback/mine").then(setItems).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!items) return <div className="loading">Loading…</div>;

  const pending = items.filter((i) => !i.submitted);
  const done = items.filter((i) => i.submitted);

  return (
    <div>
      <h1>Feedback I Owe</h1>
      <p className="subtitle">Reviews where you've been asked to contribute — including your own self-reviews.</p>

      <div className="card">
        <div className="card-head"><h2>Pending ({pending.length})</h2></div>
        {pending.length === 0 && <p className="muted">All caught up.</p>}
        {pending.map((i) => (
          <FeedbackRow key={i.id} item={i} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Submitted ({done.length})</h2></div>
          {done.map((i) => <FeedbackRow key={i.id} item={i} />)}
        </div>
      )}
    </div>
  );
}

function FeedbackRow({ item }) {
  return (
    <div className="feedback-row">
      <div>
        <strong>{item.isSelf ? "Self-review" : `${sourceLabel[item.reviewerRole]} review of ${item.subject.name}`}</strong>
        <small>{item.cycle.name} {item.dueDate ? `· due ${new Date(item.dueDate).toLocaleDateString()}` : ""}</small>
      </div>
      <div className="feedback-row-actions">
        <StatusPill status={item.status} />
        <Link className="btn small" to={`/feedback/${item.id}`}>{item.submitted ? "Edit" : "Give feedback"}</Link>
      </div>
    </div>
  );
}
