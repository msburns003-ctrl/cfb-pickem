import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshData } from "@/lib/app-refresh";
import { isRunningAsApp } from "@/lib/install";

const THRESHOLD_PX = 64; // pull this far (after resistance) to refresh
const MAX_PULL_PX = 96;
const RESISTANCE = 0.5;

// True if the touch started inside something scrolled away from its top
// (a dialog, menu or scrolled panel), where pulling down should scroll it.
function insideScrolledElement(target: EventTarget | null) {
  for (let el = target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

// Pull-to-refresh for the home-screen app, which has none of its own (browser
// tabs keep the browser's). Pulling down from the top of the page refetches
// the data on screen without reloading, so unsaved picks are kept.
export function PullToRefresh() {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!isRunningAsApp()) return;

    const setPullBoth = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1 || window.scrollY > 0 || insideScrolledElement(e.target)) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = e.touches[0].clientX - start.current.x;
      // Only a mostly vertical downward pull counts (not swiping the grid sideways).
      if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
        if (pullRef.current) setPullBoth(0);
        return;
      }
      setPullBoth(Math.min(MAX_PULL_PX, dy * RESISTANCE));
    };

    const onEnd = async () => {
      const pulled = pullRef.current;
      start.current = null;
      setPullBoth(0);
      if (pulled < THRESHOLD_PX || refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      try {
        await refreshData(queryClient);
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [queryClient]);

  if (pull === 0 && !refreshing) return null;
  const ready = pull >= THRESHOLD_PX;
  const offset = refreshing ? THRESHOLD_PX : pull;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + ${offset}px)` }}
      role="status"
      aria-label={refreshing ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}
      data-testid="pull-to-refresh"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-card-border bg-card shadow-md">
        <RefreshCw
          className={cn("h-4 w-4 text-muted-foreground", (ready || refreshing) && "text-foreground", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${(pull / THRESHOLD_PX) * 270}deg)` }}
        />
      </div>
    </div>
  );
}
