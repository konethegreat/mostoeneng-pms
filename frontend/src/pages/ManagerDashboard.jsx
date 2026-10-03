import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { Stat, StatusPill, ScoreBadge } from "../components/ui.jsx";
import { SkeletonCard } from "../components/Skeleton.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { OverviewHeader } from "../components/OverviewHeader.jsx";
import { WeekSchedule } from "../components/WeekSchedule.jsx";
import { ActivityFeed } from "../components/ActivityFeed.jsx";
import { useToast } from "../components/Toast.jsx";
import TeamSnapshot from "../pdf/TeamSnapshot.jsx";
import { downloadPdf } from "../pdf/download.js";

export default function ManagerDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api.get("/dashboard/manager").then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div className="grid-2"><SkeletonCard /><SkeletonCard /></div>;

  const s = data.summary;
  async function exportPdf() {
    try { await downloadPdf(<TeamSnapshot summary={s} rows={data.reviews} />, "team-snapshot.pdf"); }
    catch (e) { toast(e.message, "error"); }
  }
  return (
    <div>
      <OverviewHeader />
      <WeekSchedule />
      <h1>Team Performance</h1>
      <p className="subtitle">Every review you own, with live completion and cycle-time tracking from the launch button.</p>

      {s.overdueCount > 0 && (
        <div className="sla-banner">
          <span>⚠</span>
          <div><strong>{s.overdueCount} review{s.overdueCount > 1 ? "s" : ""} past SLA.</strong> Nudge reviewers or follow up — cycle time is tracked from the launch date.</div>
        </div>
      )}

      <div className="stat-grid">
        <Stat label="Active reviews" value={s.reviewCount} />
        <Stat label="Avg score" value={s.avgScore ? s.avgScore.toFixed(2) : "—"} hint="weighted, /5" />
        <Stat label="Feedback completion" value={`${s.completionPct}%`} tone={s.completionPct >= 80 ? "green" : s.completionPct >= 50 ? "amber" : "red"} />
        <Stat label="Overdue (SLA)" value={s.overdueCount} tone={s.overdueCount ? "red" : "green"} />
        <Stat label="Avg cycle time" value={s.avgCycleDays != null ? `${s.avgCycleDays}d` : "—"} hint="launch → approved" />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Reviews</h2>
          {data.reviews.length > 0 && <button className="btn small" onClick={exportPdf}>Export PDF</button>}
        </div>
        <table className="table">
          <thead>
            <tr><th>Attorney</th><th>Cycle</th><th>Status</th><th>Completion</th><th>Elapsed</th><th>Score</th><th></th></tr>
          </thead>
          <tbody>
            {data.reviews.map((r) => (
              <tr key={r.reviewId} className={r.overdue ? "row-warn" : ""}>
                <td>
                  <div className="cell-user">
                    <Avatar name={r.subject} size={32} />
                    <span><strong>{r.subject}</strong><br /><small>{r.title}</small></span>
                  </div>
                </td>
                <td>{r.cycle}</td>
                <td><StatusPill status={r.status} /></td>
                <td>
                  <div className="mini-bar"><div className="mini-fill" style={{ width: `${r.completionPct}%` }} /></div>
                  <small>{r.completion.submitted}/{r.completion.total} ({r.completionPct}%)</small>
                </td>
                <td>{r.elapsedDays != null ? `${r.elapsedDays}d` : "—"} {r.overdue && <span className="pill red">overdue</span>}</td>
                <td><ScoreBadge score={r.overallScore} /></td>
                <td><Link className="btn small" to={`/reviews/${r.reviewId}`}>Open</Link></td>
              </tr>
            ))}
            {data.reviews.length === 0 && <tr><td colSpan={7} className="muted">No reviews yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <ActivityFeed />
    </div>
  );
}
