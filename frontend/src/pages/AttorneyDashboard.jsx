import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Stat, StatusPill, ScoreBadge, Bar } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { OverviewHeader } from "../components/OverviewHeader.jsx";
import { WeekSchedule } from "../components/WeekSchedule.jsx";
import { ActivityFeed } from "../components/ActivityFeed.jsx";
import AnnualReport from "../pdf/AnnualReport.jsx";
import { downloadPdf } from "../pdf/download.js";

export default function AttorneyDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [launching, setLaunching] = useState(null);
  const [rollup, setRollup] = useState(null);

  function load() {
    api.get("/dashboard/attorney").then(setData).catch((e) => setErr(e.message));
  }
  useEffect(load, []);

  // Pull the most recent annual rollup (if any) for PDF export.
  useEffect(() => {
    if (!user?.id) return;
    api.get("/cycles").then((cycles) => {
      const annual = (cycles || []).find((c) => c.type === "ANNUAL");
      if (!annual) return;
      api.get(`/dashboard/rollup/${user.id}/${annual.id}`)
        .then((r) => { if (r.quartersComplete > 0 || r.annualScore != null) setRollup(r); })
        .catch(() => {});
    }).catch(() => {});
  }, [user?.id]);

  async function launch(cycleId) {
    setLaunching(cycleId); setErr(null);
    try {
      await api.post("/reviews/launch", { cycleId });
      load();
    } catch (e) { setErr(e.message); }
    finally { setLaunching(null); }
  }

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div className="loading">Loading your performance…</div>;

  return (
    <div>
      <OverviewHeader />
      <WeekSchedule />
      <h1>My Performance</h1>
      <p className="subtitle">Launch a review to start collecting 360° feedback. You'll see your full results once your manager approves the report.</p>

      {data.launchable.length > 0 && (
        <div className="launch-panel">
          <div>
            <h2>Ready to start a review</h2>
            <p>Pressing launch timestamps your review and requests feedback from your manager, peers, subordinates and client.</p>
          </div>
          <div className="launch-buttons">
            {data.launchable.map((c) => (
              <button key={c.id} className="btn primary launch" disabled={launching === c.id} onClick={() => launch(c.id)}>
                {launching === c.id ? "Launching…" : `🚀 Launch ${c.name}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.trend.length > 1 && (
        <div className="card">
          <div className="card-head"><h2>Score trend</h2></div>
          <div className="trend">
            {data.trend.map((t) => (
              <div key={t.cycle} className="trend-col">
                <div className="trend-bar" style={{ height: `${(t.score / 5) * 100}%` }} title={`${t.score}/5`} />
                <small>{t.cycle}</small>
                <strong>{t.score.toFixed(1)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {rollup && (
        <div className="card">
          <div className="card-head">
            <div><h2>Annual rollup — {rollup.annualCycle}</h2><small>{rollup.quartersComplete}/{rollup.quartersTotal} quarters approved</small></div>
            <div className="detail-head-right">
              <ScoreBadge score={rollup.annualScore} />
              <button className="btn small" onClick={async () => {
                try { await downloadPdf(<AnnualReport rollup={rollup} attorneyName={`${user.firstName} ${user.lastName}`} />, `annual-${rollup.annualCycle}.pdf`); }
                catch (e) { toast(e.message, "error"); }
              }}>Download PDF</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        {data.cards.map((c) => (
          <div className="card" key={c.reviewId}>
            <div className="card-head">
              <div><h2>{c.cycle}</h2><small>{c.cycleType}</small></div>
              <StatusPill status={c.status} />
            </div>

            <div className="stat-row">
              <Stat label="Feedback in" value={`${c.completion.submitted}/${c.completion.total}`} hint={`${c.completion.pct}%`} />
              {c.cycleTime.launched && <Stat label="Days elapsed" value={`${c.cycleTime.elapsedDays}d`} tone={c.cycleTime.overdue ? "red" : undefined} hint={`SLA ${c.cycleTime.slaDays}d`} />}
              {c.status === "APPROVED" && <Stat label="Overall" value={c.overallScore?.toFixed(2)} hint="/5" tone="green" />}
            </div>

            {c.status === "APPROVED" && c.byCompetency && (
              <div className="competency-list">
                {c.byCompetency.map((b) => <Bar key={b.competencyId} label={b.name} value={b.average} />)}
              </div>
            )}
            {c.status === "APPROVED" && c.finalSummary && (
              <blockquote className="summary">{c.finalSummary}</blockquote>
            )}
            {c.status !== "APPROVED" && c.cycleTime.launched && (
              <p className="muted">Results stay hidden until your manager approves this report.</p>
            )}

            <Link className="btn small" to={`/reviews/${c.reviewId}`}>View detail</Link>
          </div>
        ))}
        {data.cards.length === 0 && <p className="muted">No reviews yet — launch one above.</p>}
      </div>

      <ActivityFeed />
    </div>
  );
}
