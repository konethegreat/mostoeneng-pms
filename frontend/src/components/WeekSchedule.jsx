// Zoho-style "This week" strip: Sun–Sat with today highlighted, weekends and
// public holidays (from the cached /api/widgets/holidays proxy) marked.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Local YYYY-MM-DD (avoids the UTC shift that toISOString() would introduce).
function localISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function WeekSchedule() {
  const [holidays, setHolidays] = useState([]);

  useEffect(() => {
    const year = new Date().getFullYear();
    api.get(`/widgets/holidays?year=${year}`).then(setHolidays).catch(() => {});
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay()); // back to Sunday

  const holMap = Object.fromEntries(holidays.map((h) => [h.date, h.name]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const range = `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  return (
    <div className="card">
      <div className="card-head"><h2>This week</h2><small>{range}</small></div>
      <div className="week-strip">
        {days.map((d) => {
          const iso = localISO(d);
          const isToday = d.getTime() === today.getTime();
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const holiday = holMap[iso];
          return (
            <div key={iso} className={`week-day ${isToday ? "today" : ""}`}>
              <span className="wd-dow">{DOW[d.getDay()]}</span>
              <span className="wd-num">{d.getDate()}</span>
              {holiday ? (
                <span className="wd-tag holiday" title={holiday}>{holiday}</span>
              ) : isWeekend ? (
                <span className="wd-tag weekend">Weekend</span>
              ) : (
                <span className="wd-tag work">9:00–18:00</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
