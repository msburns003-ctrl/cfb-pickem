import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TeamInfo } from "@shared/schema";

// A team's logo from ESPN's CDN (dark-mode version in dark mode). Renders
// nothing without a logo or if the image fails, so the team name stands alone.
// `backdrop` puts it on a white circle, for colored backgrounds like a picked button.
export function TeamLogo({ info, size, backdrop, className }: { info: TeamInfo | undefined; size: number; backdrop?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!info?.logo || failed) return null;
  const img = (src: string, cls: string) => (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", cls)}
      style={{ width: size, height: size }}
    />
  );
  const logos = (
    <>
      {img(info.logo, backdrop || !info.logoDark ? "" : "dark:hidden")}
      {!backdrop && info.logoDark && img(info.logoDark, "hidden dark:block")}
    </>
  );
  return backdrop ? (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-white p-0.5", className)} aria-hidden>
      {logos}
    </span>
  ) : (
    <span className={cn("inline-flex shrink-0", className)} aria-hidden>
      {logos}
    </span>
  );
}
