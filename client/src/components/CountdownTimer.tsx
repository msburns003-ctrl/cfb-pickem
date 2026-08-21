import { useEffect, useState } from "react";

function formatRemaining(ms: number) {
  if (ms <= 0) return "Locked";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function CountdownTimer({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = new Date(deadline).getTime() - now;
  const urgent = remaining > 0 && remaining < 1000 * 60 * 60 * 3; // under 3 hours

  return (
    <span
      className={urgent ? "font-semibold text-destructive" : remaining <= 0 ? "font-semibold text-muted-foreground" : "font-semibold text-foreground"}
      data-testid="text-countdown"
    >
      {formatRemaining(remaining)}
    </span>
  );
}
