import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import NotificationsBell from "./NotificationsBell.jsx";
import { AiStatusChip } from "./AiStatusChip.jsx";
import { Avatar } from "./Avatar.jsx";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  if (!user) { return <Outlet />; }

  const links = [];
  if (user.role === "MANAGER" || user.role === "ADMIN") links.push(["/manager", "Team Dashboard"]);
  if (user.role === "ATTORNEY" || user.role === "MANAGER") links.push(["/me", "My Performance"]);
  if (user.role === "CLIENT") links.push(["/client", "Client Portal"]);
  links.push(["/feedback", "Feedback I Owe"]);
  if (user.role === "ADMIN") links.push(["/admin", "Admin"]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <div>
            <strong>Demo Legal</strong>
            <small>Performance Management</small>
          </div>
        </div>
        <nav className="nav">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className={loc.pathname === to ? "active" : ""}>{label}</Link>
          ))}
        </nav>
        <AiStatusChip />
        <NotificationsBell />
        <div className="user-chip">
          <Avatar seed={user.id} name={`${user.firstName} ${user.lastName}`} size={36} />
          <div className="user-meta">
            <strong>{user.firstName} {user.lastName}</strong>
            <small>{user.title || user.role}</small>
          </div>
          <button className="btn ghost" onClick={() => { logout(); nav("/login"); }}>Sign out</button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
