// Zoho-style overview greeting card: time-of-day greeting, a daily quote, and
// live office weather (all from the cached server-side /api/widgets/greeting).
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Avatar } from "./Avatar.jsx";

function greetingWord(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Open-Meteo WMO weather codes → label + emoji
function weatherInfo(code) {
  if (code === 0) return { label: "Clear", icon: "☀️" };
  if (code <= 3) return { label: "Partly cloudy", icon: "⛅" };
  if (code <= 48) return { label: "Fog", icon: "🌫️" };
  if (code <= 57) return { label: "Drizzle", icon: "🌦️" };
  if (code <= 67) return { label: "Rain", icon: "🌧️" };
  if (code <= 77) return { label: "Snow", icon: "❄️" };
  if (code <= 82) return { label: "Showers", icon: "🌧️" };
  if (code <= 99) return { label: "Thunderstorm", icon: "⛈️" };
  return { label: "—", icon: "🌡️" };
}

export function OverviewHeader() {
  const { user } = useAuth();
  const [w, setW] = useState(null);

  useEffect(() => {
    api.get("/widgets/greeting").then(setW).catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const wx = w?.weather ? weatherInfo(w.weather.code) : null;

  return (
    <div className="overview-header">
      <div className="oh-left">
        <Avatar seed={user.id} name={`${user.firstName} ${user.lastName}`} size={56} />
        <div>
          <h1>{greetingWord()}, {user.firstName}</h1>
          {w?.quote ? (
            <p className="oh-quote">“{w.quote.text}” <span className="muted">— {w.quote.author}</span></p>
          ) : (
            <p className="oh-quote">Have a productive day.</p>
          )}
        </div>
      </div>
      <div className="oh-right">
        {wx && (
          <div className="oh-weather">
            <span className="oh-temp">{Math.round(w.weather.tempC)}°</span>
            <span className="muted">{wx.icon} {wx.label}</span>
          </div>
        )}
        <div className="oh-date">{today}</div>
      </div>
    </div>
  );
}
