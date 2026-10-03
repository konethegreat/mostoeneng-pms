// Server-side proxies for the free public APIs that power the Zoho-style home
// widgets (motivational quote, weather, public holidays). Calling them here
// rather than from the browser keeps third parties from seeing individual user
// IPs/usage (POPIA), lets us cache, and lets the UI degrade gracefully when an
// upstream is down.

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Office location + country (override in .env). Default: Johannesburg, ZA.
const LAT = process.env.OFFICE_LAT || "-26.2041";
const LON = process.env.OFFICE_LON || "28.0473";
const COUNTRY = (process.env.HOLIDAY_COUNTRY || "ZA").toUpperCase();

// Curated fallback quotes so the greeting always has something, even if the
// upstream quote API is unavailable.
const LOCAL_QUOTES = [
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Excellence is not an act, but a habit.", author: "Aristotle" },
  { text: "Quality means doing it right when no one is looking.", author: "Henry Ford" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
];

const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function fetchJson(url, ms = 4000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(id);
  }
}

// ── Greeting widget: a quote + current office weather (cached 30 min) ──
router.get("/greeting", requireAuth, async (_req, res) => {
  const data = await cached("greeting", 30 * 60 * 1000, async () => {
    const out = { quote: null, weather: null };
    try {
      const q = await fetchJson("https://zenquotes.io/api/random");
      if (Array.isArray(q) && q[0]?.q) out.quote = { text: q[0].q, author: q[0].a };
    } catch { /* fall through to local */ }
    if (!out.quote) out.quote = LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)];
    try {
      const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code`);
      if (w.current) out.weather = { tempC: w.current.temperature_2m, code: w.current.weather_code };
    } catch { /* weather is optional */ }
    return out;
  });
  res.json(data);
});

// ── Public holidays for a year/country (cached 24h; empty array on failure) ──
router.get("/holidays", requireAuth, async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const country = (req.query.country || COUNTRY).toUpperCase();
  try {
    const data = await cached(`hol-${country}-${year}`, 24 * 60 * 60 * 1000, () =>
      fetchJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`));
    res.json((data || []).map((h) => ({ date: h.date, name: h.localName || h.name })));
  } catch {
    res.json([]);
  }
});

export default router;
