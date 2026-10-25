import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowDown, ArrowUp, BarChart3, LayoutGrid, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GridResponse } from "@/lib/grid-pdf";
import type { Pick, SeasonStatsResponse, UpsetPick, Week } from "@shared/schema";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface WeekRecapProps {
  week: Week;
  userId: number | undefined;
  myPicks: Pick[];
  myUpsetPick: UpsetPick | null;
}

// Shown at the top of the picks page once a week is fully graded, until the
// next week opens: your week, your season move, the weekly winner and the
// best upset hit.
export function WeekRecap({ week, userId, myPicks, myUpsetPick }: WeekRecapProps) {
  const { data: stats } = useQuery<SeasonStatsResponse>({ queryKey: ["/api/stats"] });
  const { data: grid } = useQuery<GridResponse>({ queryKey: [`/api/weeks/${week.id}/grid`] });

  const me = stats?.members.find((m) => m.userId === userId);
  const myWeekIndex = me?.weeks.findIndex((w) => w.weekId === week.id) ?? -1;
  const myWeek = me && myWeekIndex >= 0 ? me.weeks[myWeekIndex] : undefined;
  const prevSeasonRank = me && myWeekIndex > 0 ? me.weeks[myWeekIndex - 1].seasonRank : null;
  const moved = myWeek && prevSeasonRank != null ? prevSeasonRank - myWeek.seasonRank : 0;
  const memberCount = stats?.members.length ?? 0;

  const wins = myPicks.filter((p) => p.isCorrect === true).length;
  const losses = myPicks.filter((p) => p.isCorrect === false).length;

  // Weekly winner: top score; a tie is a PUSH (league rule).
  const weekScores = (stats?.members ?? []).map((m) => ({ name: m.name, points: m.weeks.find((w) => w.weekId === week.id)?.points ?? 0 }));
  const top = Math.max(0, ...weekScores.map((s) => s.points));
  const winners = weekScores.filter((s) => s.points === top && top > 0);

  // Best upset hit: the winning upset pick worth the most, grouped by team.
  const upsetWins = (grid?.grid ?? []).filter((r) => r.upsetPick?.result === "win");
  const bestPoints = Math.max(0, ...upsetWins.map((r) => r.upsetPick!.pointsEarned));
  const best = upsetWins.filter((r) => r.upsetPick!.pointsEarned === bestPoints && bestPoints > 0);
  const bestTeam = best[0]?.upsetPick;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm" data-testid="card-week-recap">
      <h2 className="flex items-center gap-2 font-semibold">
        <Trophy className="h-4 w-4 text-accent" /> {week.label} is final
      </h2>

      <div className="flex flex-col gap-1 text-muted-foreground">
        <p data-testid="text-recap-you">
          You: <span className="font-semibold text-foreground">{myWeek?.points ?? 0} pts</span>
          {wins + losses > 0 && ` (${wins}–${losses})`}
          {myUpsetPick?.result === "win" && ` · upset +${myUpsetPick.pointsEarned}`}
          {myWeek && memberCount > 0 && ` · ${ordinal(myWeek.weekRank)} of ${memberCount} this week`}
        </p>
        {myWeek && (
          <p className="flex flex-wrap items-center gap-1" data-testid="text-recap-season">
            Season: <span className="font-semibold text-foreground">{ordinal(myWeek.seasonRank)}</span>
            {moved > 0 && (
              <span className="inline-flex items-center text-green-600 dark:text-green-400">
                <ArrowUp className="h-3.5 w-3.5" aria-hidden /> up {moved}
              </span>
            )}
            {moved < 0 && (
              <span className="inline-flex items-center text-destructive">
                <ArrowDown className="h-3.5 w-3.5" aria-hidden /> down {-moved}
              </span>
            )}
            {me && <span>· {me.totalPoints} pts</span>}
          </p>
        )}
        {winners.length > 0 && (
          <p data-testid="text-recap-winner">
            {winners.length > 1 ? "Weekly winner: PUSH between " : "Weekly winner: "}
            <span className="font-medium text-foreground">{winners.map((w) => w.name).join(", ")}</span> ({top} pts)
          </p>
        )}
        {bestTeam && (
          <p data-testid="text-recap-upset">
            Best upset: <span className="font-medium text-foreground">{bestTeam.underdogTeam}</span> +{bestTeam.spread} over{" "}
            {bestTeam.favoriteTeam} for {best.map((r) => r.name).join(", ")} (+{bestPoints})
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/grid">
            <LayoutGrid className="h-4 w-4" /> See the grid
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/stats">
            <BarChart3 className="h-4 w-4" /> My stats
          </Link>
        </Button>
      </div>
    </div>
  );
}
