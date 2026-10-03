import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { StatusPill } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { OverviewHeader } from "../components/OverviewHeader.jsx";
import ClientFeedback from "../pdf/ClientFeedback.jsx";
import { downloadPdf } from "../pdf/download.js";

// The external client's view: only the feedback they've been asked to give.
export default function ClientPortal() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/feedback/mine").then(setItems).catch((e) => setErr(e.message));
  }, []);

  async function downloadFeedback(requestId, name) {
    try {
      const data = await api.get(`/feedback/request/${requestId}`);
      await downloadPdf(<ClientFeedback request={data} />, `feedback-${name}.pdf`);
    } catch (e) { toast(e.message, "error"); }
  }

  if (err) return <div className="error">{err}</div>;
  if (!items) return <div className="loading">Loading…</div>;

  const pending = items.filter((i) => !i.submitted);

  return (
    <div>
      <OverviewHeader />
      <h1>Client feedback portal</h1>
      <p className="subtitle">
        Welcome{user?.clientAccount ? `, ${user.clientAccount}` : ""}. The attorneys who served you have requested
        your feedback. Your input is weighted into their performance review.
      </p>

      <div className="card">
        <div className="card-head"><h2>Feedback requested ({pending.length})</h2></div>
        {pending.length === 0 && <p className="muted">Nothing outstanding — thank you.</p>}
        {pending.map((i) => (
          <div className="feedback-row" key={i.id}>
            <div>
              <strong>Rate {i.subject.name}</strong>
              <small>{i.subject.title} · {i.cycle.name} {i.dueDate ? `· due ${new Date(i.dueDate).toLocaleDateString()}` : ""}</small>
            </div>
            <Link className="btn primary small" to={`/feedback/${i.id}`}>Give feedback</Link>
          </div>
        ))}
      </div>

      {items.some((i) => i.submitted) && (
        <div className="card">
          <div className="card-head"><h2>Submitted</h2></div>
          {items.filter((i) => i.submitted).map((i) => (
            <div className="feedback-row" key={i.id}>
              <div><strong>{i.subject.name}</strong><small>{i.cycle.name}</small></div>
              <div className="feedback-row-actions">
                <StatusPill status="SUBMITTED" />
                <button className="btn small" onClick={() => downloadFeedback(i.id, i.subject.name)}>Download PDF</button>
                <Link className="btn small" to={`/feedback/${i.id}`}>Edit</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
