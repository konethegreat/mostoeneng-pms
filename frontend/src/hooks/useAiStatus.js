// Fetches /api/ai/status once (module-cached) so AI affordances can show/hide
// and copy can adapt. Returns { aiEnabled, model }.
import { useEffect, useState } from "react";
import { api } from "../api/client.js";

let cache = null;

export function useAiStatus() {
  const [status, setStatus] = useState(cache);
  useEffect(() => {
    if (cache) return;
    api
      .get("/ai/status")
      .then((s) => { cache = s; setStatus(s); })
      .catch(() => setStatus({ aiEnabled: false }));
  }, []);
  return status || { aiEnabled: false };
}
