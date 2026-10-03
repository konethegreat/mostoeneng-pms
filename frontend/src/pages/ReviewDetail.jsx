import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { StatusPill, ScoreBadge, Bar, Stat, sourceLabel } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAiStatus } from "../hooks/useAiStatus.js";
import { AiBadge } from "../components/AiBadge.jsx";
import { Avatar } from "../components/Avatar.jsx";
import ReviewReport from "../pdf/ReviewReport.jsx";
import { downloadPdf } from "../pdf/download.js";

export default function ReviewDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { aiEnabled } = useAiStatus();
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [organized, setOrganized] = useState({}); // requestId -> { strengths, improvements, themes }
  const [organizing, setOrganizing] = useState(null);
  const [memory, setMemory] = useState(null);
  const [aiDrafting, setAiDrafting] = useState(false);

  function load() {
    api.get(`/reviews/${id}`).then((d) => { setR(d); setDraft(d.finalSummary || d.draftSummary || ""); }).catch((e) => setErr(e.message));
  }
  useEffect(load, [id]);

  // Attorney memory (backend enforces who may see it; ignore 403s quietly).
  useEffect(() => {
    if (!r?.subject?.id) return;
    api.get(`/ai/attorneys/${r.subject.id}/memory`).then((d) => setMemory(d.memory || null)).catch(() => {});
  }, [r?.subject?.id]);

  if (err) return <div className="error">{err}</div>;
  if (!r) return <div className="loading">Loading review…</div>;

  const isManager = (user.role === "MANAGER" && r.manager?.id === user.id) || user.role === "ADMIN";
  const locked = ["FINALIZED", "APPROVED"].includes(r.status);
  const themes = memory?.themes ? safeParse(memory.themes) : [];

  async function act(path, body) {
    setBusy(true); setErr(null);
    try { await api.post(`/reviews/${id}/${path}`, body); toast(`Review ${path.replace("-", " ")}d`, "success"); load(); }
    catch (e) { setErr(e.message); toast(e.message, "error"); }
    finally { setBusy(false); }
  }
  async function saveDraft() {
    setBusy(true); setErr(null);
    try { await api.patch(`/reviews/${id}/draft`, { draftSummary: draft }); toast("Draft saved", "success"); load(); }
    catch (e) { setErr(e.message); toast(e.message, "error"); }
    finally { setBusy(false); }
  }
  async function organize(requestId) {
    setOrganizing(requestId);
    try {
      const res = await api.post(`/ai/organize/${requestId}`);
      if (!res.aiEnabled) { toast("AI is not configured", "info"); return; }
      setOrganized((o) => ({ ...o, [requestId]: res.organized }));
    } catch (e) { toast(e.message, "error"); }
    finally { setOrganizing(null); }
  }
  async function draftWithAI() {
    setAiDrafting(true);
    try {
      const res = await api.post(`/ai/reviews/${id}/draft`);
      if (!res.aiEnabled) { toast("AI is not configured", "info"); return; }
      setDraft(res.draft);
      toast("AI draft ready — review and edit before saving", "success");
    } catch (e) { toast(e.message, "error"); }
    finally { setAiDrafting(false); }
  }
  async function refreshMemory() {
    try {
      const res = await api.post(`/ai/attorneys/${r.subject.id}/memory/refresh`);
      if (!res.aiEnabled) { toast("AI is not configured", "info"); return; }
      setMemory(res.memory);
      toast("Memory profile refreshed", "success");
    } catch (e) { toast(e.message, "error"); }
  }
  async function downloadReport() {
    try { await downloadPdf(<ReviewReport review={r} />, `review-${r.subject.name}-${r.cycle.name}.pdf`); }
    catch (e) { toast(e.message, "error"); }
  }

  return (
    <div>
      <div className="detail-head">
        <div>
          <h1>{r.subject.name}</h1>
          <p className="subtitle">{r.subject.title} · {r.cycle.name} · managed by {r.manager?.name}</p>
        </div>
        <div className="detail-head-right">
          <StatusPill status={r.status} />
          <ScoreBadge score={r.analytics?.overallScore ?? r.overallScore} />
          {r.status === "APPROVED" && <button className="btn small" onClick={downloadReport}>Download PDF</button>}
        </div>
      </div>

      {/* Attorney memory — longitudinal AI profile (manager/admin/subject) */}
      {memory && (
        <div className="ai-panel">
          <h3><AiBadge label="Attorney memory" /></h3>
          {memory.summary && <p style={{ marginTop: 0 }}>{memory.summary}</p>}
          {themes.length > 0 && (
            <div className="ai-themes">
              {themes.map((t, i) => <span key={i} className="pill grey">{t}</span>)}
            </div>
          )}
          <div className="ai-cols" style={{ marginTop: 12 }}>
            {memory.strengths && <div><h3>Durable strengths</h3><p style={{ margin: 0 }}>{memory.strengths}</p></div>}
            {memory.risks && <div><h3>Watch areas</h3><p style={{ margin: 0 }}>{memory.risks}</p></div>}
          </div>
          {memory.trajectory && <p className="ai-note" style={{ marginTop: 10 }}>Trajectory: {memory.trajectory}</p>}
          {isManager && aiEnabled && (
            <div className="ai-actions"><button className="btn ai small" onClick={refreshMemory}>✦ Refresh profile</button></div>
          )}
        </div>
      )}

      <div className="stat-grid">
        <Stat label="Completion" value={`${r.completion.pct}%`} hint={`${r.completion.submitted}/${r.completion.total} sources`} tone={r.completion.pct >= 80 ? "green" : "amber"} />
        {r.cycleTime.launched && <Stat label="Days since launch" value={`${r.cycleTime.elapsedDays}d`} hint={`SLA ${r.cycleTime.slaDays}d`} tone={r.cycleTime.overdue ? "red" : undefined} />}
        <Stat label="Launched" value={r.launchedAt ? new Date(r.launchedAt).toLocaleDateString() : "—"} />
        <Stat label="Approved" value={r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : "—"} />
      </div>

      <div className="grid-2">
        {/* 360 sources */}
        <div className="card">
          <div className="card-head"><h2>360° sources</h2></div>
          <table className="table compact">
            <tbody>
              {r.requests.map((q) => (
                <tr key={q.id}>
                  <td><span className="pill grey">{sourceLabel[q.reviewerRole]}</span></td>
                  <td>
                    <div className="cell-user">
                      <Avatar seed={q.reviewer.id} name={q.reviewer.name} size={28} />
                      {q.reviewer.name}
                    </div>
                  </td>
                  <td><StatusPill status={q.status} /></td>
                  <td>
                    {aiEnabled && isManager && q.submitted && (
                      <button className="btn ai small" disabled={organizing === q.id} onClick={() => organize(q.id)}>
                        {organizing === q.id ? "…" : "✦ Organize"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {Object.entries(organized).map(([rid, o]) => {
            const q = r.requests.find((x) => x.id === rid);
            return (
              <div className="ai-panel" key={rid}>
                <h3><AiBadge /> {q ? `${sourceLabel[q.reviewerRole]} · ${q.reviewer.name}` : "Organized feedback"}</h3>
                <div className="ai-cols">
                  <div>
                    <strong>Strengths</strong>
                    <ul className="ai-list">{(o.strengths || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                  <div>
                    <strong>Areas to improve</strong>
                    <ul className="ai-list">{(o.improvements || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                </div>
                {o.themes?.length > 0 && (
                  <div className="ai-themes">{o.themes.map((t, i) => <span key={i} className="pill grey">{t}</span>)}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* analytics (privileged only) */}
        {r.analytics ? (
          <div className="card">
            <div className="card-head"><h2>Competency breakdown</h2></div>
            {r.analytics.byCompetency.length === 0 && <p className="muted">No feedback submitted yet.</p>}
            {r.analytics.byCompetency.map((b) => <Bar key={b.competencyId} label={b.name} value={b.average} />)}
            {r.analytics.bySource.length > 0 && (
              <>
                <h3 className="sub">By source (blind-spot check)</h3>
                {r.analytics.bySource.map((s) => <Bar key={s.source} label={sourceLabel[s.source]} value={s.average} />)}
              </>
            )}
          </div>
        ) : (
          <div className="card"><p className="muted">Detailed scores are visible to the manager and the attorney only.</p></div>
        )}
      </div>

      {/* Manager workflow */}
      {isManager && (
        <div className="card">
          <div className="card-head">
            <h2>Manager report</h2>
            {aiEnabled && !locked && (
              <button className="btn ai small" disabled={aiDrafting} onClick={draftWithAI}>
                {aiDrafting ? "Drafting…" : "✦ Draft with AI"}
              </button>
            )}
          </div>
          {draft === r.aiDraftSummary && r.aiDraftSummary && (
            <p className="ai-note"><AiBadge /> AI-generated draft — edit freely before saving; you own the final report.</p>
          )}
          <textarea
            rows={6}
            value={draft}
            disabled={locked}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write the narrative assessment that accompanies the scores… or use ✦ Draft with AI."
          />
          <div className="workflow-actions">
            {!locked && <button className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>}
            {(r.status === "DRAFT") && <button className="btn" disabled={busy} onClick={() => act("submit")}>Submit for review</button>}
            {(r.status === "IN_REVIEW" || r.status === "DRAFT") && (
              <button className="btn primary" disabled={busy} onClick={() => act("finalize", { finalSummary: draft })}>Finalize</button>
            )}
            {r.status === "FINALIZED" && <button className="btn primary" disabled={busy} onClick={() => act("approve")}>Approve (lock)</button>}
            {locked && r.status !== "APPROVED" && <button className="btn ghost" disabled={busy} onClick={() => act("send-back")}>Send back to draft</button>}
            {r.status === "APPROVED" && <span className="pill green">Approved & locked — feeds annual rollup</span>}
          </div>
        </div>
      )}

      {/* Final summary visible to the attorney once approved */}
      {!isManager && r.status === "APPROVED" && r.finalSummary && (
        <div className="card"><div className="card-head"><h2>Manager's summary</h2></div><blockquote className="summary">{r.finalSummary}</blockquote></div>
      )}

      {/* Goals */}
      {r.goals.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Development goals</h2></div>
          {r.goals.map((g) => (
            <div className="goal" key={g.id}>
              <div><strong>{g.title}</strong>{g.description && <small>{g.description}</small>}</div>
              <span className={`pill ${g.status === "ACHIEVED" ? "green" : g.status === "MISSED" ? "red" : "amber"}`}>{g.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Audit trail */}
      <div className="card">
        <div className="card-head"><h2>History</h2></div>
        <ol className="timeline">
          {r.events.map((e) => (
            <li key={e.id}>
              <span className="dot" />
              <div><strong>{prettyAction(e.action)}</strong> by {e.actor}{e.note ? ` — ${e.note}` : ""}
                <small>{new Date(e.at).toLocaleString()}</small></div>
            </li>
          ))}
          {r.events.length === 0 && <p className="muted">No activity yet.</p>}
        </ol>
      </div>
    </div>
  );
}

function prettyAction(a) {
  return ({ LAUNCHED: "Launched", DRAFT_SAVED: "Draft saved", SUBMITTED: "Submitted for review", FINALIZED: "Finalized", APPROVED: "Approved", SENT_BACK: "Sent back" })[a] || a;
}

function safeParse(json) {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
