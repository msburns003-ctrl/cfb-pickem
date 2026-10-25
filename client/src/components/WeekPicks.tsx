import { useQuery } from "@tanstack/react-query";
import { Check, Minus, TrendingUp, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";
import { useTeamInfo } from "@/hooks/use-team-info";
import type { GridResponse } from "@/lib/grid-pdf";
import type { Game } from "@shared/schema";

function teamLabel(team: string, rank: number | null) {
  return rank ? `#${rank} ${team}` : team;
}

function finalScore(g: Game) {
  return g.awayScore != null && g.homeScore != null ? `${g.awayScore}–${g.homeScore}` : null;
}

// One member's picks for one graded week, from the same grid data everyone
// can already see for that week.
export function WeekPicks({ weekId, weekLabel, userId, memberName, isYou }: { weekId: number; weekLabel: string; userId: number; memberName: string; isYou: boolean }) {
  const { data, isLoading, error } = useQuery<GridResponse>({ queryKey: [`/api/weeks/${weekId}/grid`] });
  const teamInfo = useTeamInfo(weekId);
  const row = data?.grid.find((r) => r.userId === userId);

  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid="card-week-picks">
      <h2 className="mb-3 text-sm font-semibold">
        {isYou ? "Your" : `${memberName}'s`} picks · {weekLabel}
        {row && <span className="ml-2 font-normal text-muted-foreground">{row.weekPoints} pts</span>}
      </h2>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error || !data ? (
        <p className="text-sm text-muted-foreground">This week's picks aren't available.</p>
      ) : !row ? (
        <p className="text-sm text-muted-foreground">Pick history isn't shown for this member.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-card-border text-sm">
          {data.games.map((g) => {
            const p = row.picks[g.id];
            const pushed = g.atsResult === "push" && p?.isCorrect === false;
            return (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2" data-testid={`row-week-pick-${g.id}`}>
                <div className="min-w-0">
                  <div className="truncate text-xs text-muted-foreground">
                    {teamLabel(g.awayTeam, g.awayRank)} @ {teamLabel(g.homeTeam, g.homeRank)}
                    {finalScore(g) && ` · ${finalScore(g)}`}
                    {g.isMoneyGame && " · money game"}
                  </div>
                  <div className="flex items-center gap-1.5 font-medium">
                    {p ? (
                      <>
                        <TeamLogo info={teamInfo[p.selectedTeam]} size={18} />
                        {p.selectedTeam}
                        <span className="text-xs font-normal text-muted-foreground">
                          {p.selectedTeam === g.favoriteTeam ? `-${g.spread}` : `+${g.spread}`} {g.pickType === "SU" && "· straight up"}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No pick</span>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
                    p?.isCorrect === true && "text-green-600 dark:text-green-400",
                    p?.isCorrect === false && !pushed && "text-destructive",
                    (!p || p.isCorrect == null || pushed) && "text-muted-foreground",
                  )}
                >
                  {p?.isCorrect === true && (
                    <>
                      <Check className="h-4 w-4" aria-hidden /> +{g.isMoneyGame ? 2 : 1}
                    </>
                  )}
                  {pushed && (
                    <>
                      <Minus className="h-4 w-4" aria-hidden /> push
                    </>
                  )}
                  {p?.isCorrect === false && !pushed && (
                    <>
                      <X className="h-4 w-4" aria-hidden /> 0
                    </>
                  )}
                  {(!p || p.isCorrect == null) && <Minus className="h-4 w-4" aria-label="not graded" />}
                </span>
              </li>
            );
          })}
          <li className="flex items-center justify-between gap-3 py-2" data-testid="row-week-pick-upset">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Upset pick
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                {row.upsetPick ? (
                  <>
                    <TeamLogo info={teamInfo[row.upsetPick.underdogTeam]} size={18} />
                    {row.upsetPick.underdogTeam}
                    <span className="text-xs font-normal text-muted-foreground">
                      +{row.upsetPick.spread} vs {row.upsetPick.favoriteTeam}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </div>
            </div>
            {row.upsetPick && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
                  row.upsetPick.result === "win" && "text-green-600 dark:text-green-400",
                  row.upsetPick.result === "loss" && "text-destructive",
                  (row.upsetPick.result === "push" || row.upsetPick.result === "pending") && "text-muted-foreground",
                )}
              >
                {row.upsetPick.result === "win" && (
                  <>
                    <Check className="h-4 w-4" aria-hidden /> +{row.upsetPick.pointsEarned}
                  </>
                )}
                {row.upsetPick.result === "loss" && (
                  <>
                    <X className="h-4 w-4" aria-hidden /> 0
                  </>
                )}
                {row.upsetPick.result === "push" && "push"}
                {row.upsetPick.result === "pending" && <Minus className="h-4 w-4" aria-label="not graded" />}
              </span>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
