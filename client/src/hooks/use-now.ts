import { useEffect, useState } from "react";

// Current time in ms, re-rendering every `intervalMs` so kickoff and
// deadline locks take effect while the page is open.
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
