// Deterministic avatar via DiceBear (free, no key). To avoid leaking PII to a
// third party (POPIA), the seed (name / id) is SHA-256-hashed with a salt
// before it ever reaches DiceBear — so the service only sees an opaque token,
// never an attorney's name or our internal id. Falls back to a local monogram
// while hashing or if DiceBear is unreachable (no network call in that case).
//
// Swap STYLE to "initials" for clean monograms instead of illustrated faces.
import { useEffect, useState } from "react";

const STYLE = "notionists-neutral";
const SALT = "mostoeneng-avatar-v1";

async function hashSeed(raw) {
  if (!globalThis.crypto?.subtle) throw new Error("no subtle crypto");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${SALT}:${raw}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function Avatar({ seed, name, size = 36 }) {
  const raw = seed || name || "user";
  const [hash, setHash] = useState(null);
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    let on = true;
    hashSeed(raw).then((h) => on && setHash(h)).catch(() => on && setFailed(true));
    return () => { on = false; };
  }, [raw]);

  // Monogram while hashing or on any failure — no third-party request is made.
  if (failed || !hash) {
    return (
      <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
        {initial}
      </span>
    );
  }
  return (
    <img
      className="avatar"
      src={`https://api.dicebear.com/9.x/${STYLE}/svg?seed=${hash}&radius=50&backgroundColor=1b2440,3d5878,b08d57`}
      alt={name || "avatar"}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
