import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { Empty } from "../components/Empty.jsx";

export default function Admin() {
  const toast = useToast();
  const [cycles, setCycles] = useState(null);
  const [comps, setComps] = useState([]);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({ name: "", type: "QUARTERLY", periodStart: "", periodEnd: "", slaDays: 30, parentId: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    api.get("/cycles").then(setCycles).catch((e) => setErr(e.message));
    api.get("/users/competencies").then(setComps).catch(() => {});
  }
  useEffect(load, []);

  const annuals = (cycles || []).filter((c) => c.type === "ANNUAL");

  async function createCycle(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/cycles", {
        name: form.name,
        type: form.type,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        slaDays: Number(form.slaDays),
        parentId: form.parentId || null,
      });
      toast("Cycle created", "success");
      setForm({ name: "", type: "QUARTERLY", periodStart: "", periodEnd: "", slaDays: 30, parentId: "" });
      load();
    } catch (e2) { toast(e2.message, "error"); }
    finally { setBusy(false); }
  }
  async function closeCycle(id) {
    try { await api.patch(`/cycles/${id}/close`); toast("Cycle closed", "success"); load(); }
    catch (e2) { toast(e2.message, "error"); }
  }

  if (err) return <div className="error">{err}</div>;

  return (
    <div>
      <h1>Admin</h1>
      <p className="subtitle">Manage review cycles and view the competency framework.</p>

      <div className="card">
        <div className="card-head"><h2>Create a cycle</h2></div>
        <form className="admin-form" onSubmit={createCycle}>
          <label>Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Q3 2026" required />
          </label>
          <label>Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
          <label>Period start
            <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required />
          </label>
          <label>Period end
            <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required />
          </label>
          <label>SLA days
            <input type="number" min="1" value={form.slaDays} onChange={(e) => setForm({ ...form, slaDays: e.target.value })} />
          </label>
          {form.type === "QUARTERLY" && annuals.length > 0 && (
            <label>Rolls up into
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">— none —</option>
                {annuals.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          <button className="btn primary" disabled={busy} type="submit">{busy ? "Creating…" : "Create cycle"}</button>
        </form>
      </div>

      <div className="card">
        <div className="card-head"><h2>Cycles</h2></div>
        {!cycles && <p className="loading">Loading…</p>}
        {cycles && cycles.length === 0 && <Empty title="No cycles yet" hint="Create the first review cycle above." />}
        {cycles && cycles.length > 0 && (
          <table className="table">
            <thead><tr><th>Name</th><th>Type</th><th>Window</th><th>SLA</th><th>Reviews</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.type}</td>
                  <td><small>{new Date(c.periodStart).toLocaleDateString()} – {new Date(c.periodEnd).toLocaleDateString()}</small></td>
                  <td>{c.slaDays}d</td>
                  <td>{c._count?.reviews ?? 0}</td>
                  <td><span className={`pill ${c.status === "OPEN" ? "green" : "grey"}`}>{c.status}</span></td>
                  <td>{c.status === "OPEN" && <button className="btn ghost small" onClick={() => closeCycle(c.id)}>Close</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>Competency framework</h2></div>
        <table className="table compact">
          <thead><tr><th>Competency</th><th>Category</th><th>Weight</th></tr></thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.id}><td><strong>{c.name}</strong><br /><small>{c.description}</small></td><td>{c.category}</td><td>{c.weight.toFixed(1)}×</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
