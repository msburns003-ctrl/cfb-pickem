import { cn } from "@/lib/utils";
import type { WeekTally } from "@/lib/projection";
import type { UpsetPick } from "@shared/schema";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export interface SeasonStanding {
  rank: number;
  tied: boolean;
  memberCount: number;
  totalPoints: number;
}

interface WeekSummaryProps {
  tally: WeekTally;
  upsetPick: UpsetPick | null;
  season: SeasonStanding | null;
}

// "Your week so far" card at the top of the picks page: graded record, live
// pick status, points (official and projected), and season rank.
export function WeekSummary({ tally, upsetPick, season }: WeekSummaryProps) {
  const liveCount = tally.liveWinning + tally.liveLosing + tally.liveEven;
  const graded = tally.wins + tally.losses;
  const showProjected = tally.projectedPoints !== tally.officialPoints || liveCount > 0 || tally.upsetLive !== null;

  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid="card-week-summary">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 text-sm">
          <h2 className="font-semibold">Your week so far</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            {graded > 0 && (
              <span data-testid="text-summary-record">
                <span className="font-medium text-foreground">
                  {tally.wins}–{tally.losses}
                </span>{" "}
                graded
              </span>
            )}
            {liveCount > 0 && (
              <span className="italic" data-testid="text-summary-live">
                Live:{" "}
                {[
                  tally.liveWinning > 0 && <span key="w" className="text-green-600 dark:text-green-400">{tally.liveWinning} winning</span>,
                  tally.liveLosing > 0 && <span key="l" className="text-destructive">{tally.liveLosing} losing</span>,
                  tally.liveEven > 0 && <span key="e">{tally.liveEven} even</span>,
                ]
                  .filter(Boolean)
                  .flatMap((el, i) => (i === 0 ? [el] : [" · ", el]))}
              </span>
            )}
            {upsetPick && (
              <span data-testid="text-summary-upset">
                Upset: {upsetPick.underdogTeam}{" "}
                {upsetPick.result === "win" ? (
                  <span className="text-green-600 dark:text-green-400">won +{upsetPick.pointsEarned}</span>
                ) : upsetPick.result === "loss" ? (
                  <span className="text-destructive">lost</span>
                ) : upsetPick.result === "push" ? (
                  "push"
                ) : tally.upsetLive ? (
                  <span
                    className={cn(
                      "italic",
                      tally.upsetLive === "winning" && "text-green-600 dark:text-green-400",
                      tally.upsetLive === "losing" && "text-destructive",
                    )}
                  >
                    {tally.upsetLive === "even" ? "tied" : tally.upsetLive}
                  </span>
                ) : (
                  "pending"
                )}
              </span>
            )}
          </div>
          {season && (
            <span className="text-muted-foreground" data-testid="text-summary-season">
              Season:{" "}
              <span className="font-medium text-foreground">
                {season.tied && "T-"}
                {ordinal(season.rank)}
              </span>{" "}
              of {season.memberCount} · {season.totalPoints} pts
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl font-semibold leading-none" data-testid="text-summary-points">
            {tally.officialPoints}
            <span className="ml-1 text-sm font-normal text-muted-foreground">pts</span>
          </div>
          {showProjected && (
            <div className="mt-1 text-xs italic text-muted-foreground" data-testid="text-summary-projected">
              {tally.projectedPoints} projected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
