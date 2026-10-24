import { Link } from "wouter";
import type { MemberSeasonStats, SeasonStatsResponse } from "@shared/schema";

interface Leader {
  label: string;
  value: string;
  members: MemberSeasonStats[];
}

// Everyone tied for the top value, or nobody if the best is zero.
function leadersBy(members: MemberSeasonStats[], value: (m: MemberSeasonStats) => number): MemberSeasonStats[] {
  const best = Math.max(0, ...members.map(value));
  return best > 0 ? members.filter((m) => value(m) === best) : [];
}

// Season leaders strip for the standings page. Win rate needs at least half
// the most picks anyone has graded, so one lucky pick can't top it.
export function LeagueLeaders({ data }: { data: SeasonStatsResponse }) {
  const decided = (m: MemberSeasonStats) => m.overall.wins + m.overall.losses;
  const minPicks = Math.max(...data.members.map(decided)) / 2;
  const pct = (m: MemberSeasonStats) => (decided(m) >= minPicks && decided(m) > 0 ? Math.round((m.overall.wins / decided(m)) * 100) : 0);

  const winners = leadersBy(data.members, (m) => m.weeklyWins);
  const accurate = leadersBy(data.members, pct);
  const upsets = leadersBy(data.members, (m) => m.upsets.points);
  const streak = leadersBy(data.members, (m) => m.longestStreak);

  const leaders: Leader[] = [
    { label: "Most weekly wins", value: winners[0] ? String(winners[0].weeklyWins) : "–", members: winners },
    { label: "Best pick rate", value: accurate[0] ? `${pct(accurate[0])}%` : "–", members: accurate },
    { label: "Upset points", value: upsets[0] ? String(upsets[0].upsets.points) : "–", members: upsets },
    { label: "Longest streak", value: streak[0] ? `${streak[0].longestStreak} in a row` : "–", members: streak },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="league-leaders">
      {leaders.map((l) => (
        <div key={l.label} className="rounded-lg border border-card-border bg-card p-3">
          <div className="text-xs text-muted-foreground">{l.label}</div>
          <div className="mt-1 font-display text-lg font-semibold tabular-nums">{l.value}</div>
          <div className="mt-0.5 truncate text-xs">
            {l.members.length === 0
              ? "—"
              : l.members.map((m, i) => (
                  <span key={m.userId}>
                    {i > 0 && ", "}
                    <Link href={`/stats/${m.userId}`} className="hover:underline">
                      {m.name}
                    </Link>
                  </span>
                ))}
          </div>
        </div>
      ))}
    </div>
  );
}
