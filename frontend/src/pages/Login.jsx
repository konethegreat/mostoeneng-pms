import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const DEMO = [
  ["Admin (HR)", "admin@example.test"],
  ["Manager", "t.dlamini@example.test"],
  ["Attorney", "n.khumalo@example.test"],
  ["Attorney (mid-cycle)", "s.naidoo@example.test"],
  ["Client", "client@client.example.test"],
];

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) { nav("/"); return null; }

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand big">
          <span className="brand-mark">M</span>
          <div><strong>Demo Legal</strong><small>Performance Management</small></div>
        </div>
        <form onSubmit={submit}>
          <label>Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.test" autoFocus />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div className="demo-logins">
          <p>Demo accounts (use the password configured when seeding):</p>
          {DEMO.map(([label, mail]) => (
            <button key={mail} className="demo-btn" onClick={() => setEmail(mail)}>
              <strong>{label}</strong><span>{mail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
