// Builds the plain-text standings updates and pick reminders the
// commissioner shares to the league group text from the admin week page.
// Pure functions only — the page fetches the data and handles sharing.

import { formatEastern } from "@/lib/time";
import type { GridRow } from "@/lib/grid-pdf";
import type { Game, Week } from "@shared/schema";

export const SHARE_TOP_N = 10;

interface Ranked {
  rank: number;
  names: string[];
  points: number;
}

/**
 * Groups members by points with shared rank on ties (no tiebreaker), the
 * same 1, 2, 2, 4 ranking the standings page uses, and keeps every group
 * whose rank is within the top `limit` — so a tie at 10th shows everyone.
 */
export function rankTop(rows: { name: string; points: number }[], limit = SHARE_TOP_N): Ranked[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const groups: Ranked[] = [];
  sorted.forEach((row, i) => {
    const last = groups[groups.length - 1];
    if (last && last.points === row.points) last.names.push(row.name);
    else groups.push({ rank: i + 1, names: [row.name], points: row.points });
  });
  return groups.filter((g) => g.rank <= limit);
}

function formatRanked(groups: Ranked[]): string[] {
  return groups.map((g) => {
    const label = g.names.length > 1 ? `T${g.rank}` : `${g.rank}`;
    return `${label}. ${g.names.join(", ")} – ${g.points} pt${g.points === 1 ? "" : "s"}`;
  });
}

export function buildLiveUpdate(opts: {
  week: Week;
  games: Game[]; // the week's selected slate
  grid: GridRow[];
  season: { name: string; totalPoints: number }[];
  siteUrl: string;
}): string {
  const { week, games, grid, season, siteUrl } = opts;
  const finals = games.filter((g) => g.status === "final").length;
  const lines: string[] = [];

  lines.push(`🏈 ${week.label} update (${finals} of ${games.length} games final)`);
  lines.push("");
  lines.push(`This week – top ${SHARE_TOP_N}`);
  if (finals === 0) {
    lines.push("No games final yet.");
  } else {
    lines.push(...formatRanked(rankTop(grid.map((r) => ({ name: r.name, points: r.weekPoints })))));
  }

  const upsetHits = grid.filter((r) => r.upsetPick?.result === "win");
  if (upsetHits.length > 0) {
    lines.push("");
    lines.push(
      `Underdog hits: ${upsetHits.map((r) => `${r.name} (${r.upsetPick!.underdogTeam} +${r.upsetPick!.pointsEarned})`).join(", ")}`,
    );
  }

  lines.push("");
  lines.push(`Season – top ${SHARE_TOP_N}`);
  lines.push(...formatRanked(rankTop(season.map((r) => ({ name: r.name, points: r.totalPoints })))));

  lines.push("");
  lines.push(siteUrl);
  return lines.join("\n");
}

export function buildPickReminder(opts: {
  week: Week;
  totalGames: number;
  progress: { name: string; picksSubmitted: number; hasUpsetPick: boolean }[];
  siteUrl: string;
}): string {
  const { week, totalGames, progress, siteUrl } = opts;
  const deadline = formatEastern(week.pickDeadline, { weekday: "short", hour: "numeric", minute: "2-digit" });
  const missing = progress
    .filter((p) => p.picksSubmitted < totalGames || !p.hasUpsetPick)
    .sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];

  lines.push(`⏰ ${week.label} picks lock ${deadline}`);
  lines.push("");
  if (missing.length === 0) {
    lines.push("Everyone's picks are in. 👏");
  } else {
    lines.push("Still need picks:");
    for (const p of missing) {
      const parts: string[] = [];
      if (p.picksSubmitted < totalGames) parts.push(`${p.picksSubmitted} of ${totalGames} games`);
      if (!p.hasUpsetPick) parts.push("no underdog");
      lines.push(`• ${p.name} (${parts.join(", ")})`);
    }
  }
  lines.push("");
  lines.push(siteUrl);
  return lines.join("\n");
}
