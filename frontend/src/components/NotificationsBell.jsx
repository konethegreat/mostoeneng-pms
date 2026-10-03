import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

export default function NotificationsBell() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();

  function load() {
    api.get("/notifications").then(setData).catch(() => {});
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function openItem(n) {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {});
      load();
    }
    setOpen(false);
    if (n.link) nav(n.link);
  }
  async function markAll() {
    await api.post("/notifications/read-all").catch(() => {});
    load();
  }

  return (
    <div className="bell" ref={ref}>
      <button className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications" title="Notifications">
        🔔
        {data.unread > 0 && <span className="bell-count">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button className="btn ghost small" onClick={markAll}>Mark all read</button>}
          </div>
          {data.items.length === 0 && <div className="notif-empty">You're all caught up.</div>}
          {data.items.map((n) => (
            <div key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}>
              {n.message}
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
