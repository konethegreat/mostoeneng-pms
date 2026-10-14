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

  // A finalized report stops collecting feedback, so an unanswered request closes.
  const pending = items.filter((i) => !i.submitted && i.open);
  const done = items.filter((i) => i.submitted);
  const missed = items.filter((i) => !i.submitted && !i.open);

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

      {missed.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Closed without a response ({missed.length})</h2></div>
          {missed.map((i) => <FeedbackRow key={i.id} item={i} />)}
        </div>
      )}
    </div>
  );
}

function FeedbackRow({ item }) {
  const action = !item.open ? "View" : item.submitted ? "Edit" : "Give feedback";
  return (
    <div className="feedback-row">
      <div>
        <strong>{item.isSelf ? "Self-review" : `${sourceLabel[item.reviewerRole]} review of ${item.subject.name}`}</strong>
        <small>{item.cycle.name} {item.dueDate ? `· due ${new Date(item.dueDate).toLocaleDateString()}` : ""}</small>
      </div>
      <div className="feedback-row-actions">
        <StatusPill status={item.status} />
        {!item.open && <span className="pill grey">Closed</span>}
        <Link className="btn small" to={`/feedback/${item.id}`}>{action}</Link>
      </div>
    </div>
  );
}
