import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatEastern } from "@/lib/time";
import { Tv, Check, X, Coins } from "lucide-react";
import type { Game, LiveScore, Pick } from "@shared/schema";
import { livePickStatus, type LivePickStatus } from "@shared/outcome";

function teamLabel(team: string, rank: number | null) {
  return rank ? `#${rank} ${team}` : team;
}

const LIVE_STATUS_TEXT: Record<"SU" | "ATS", Record<LivePickStatus, string>> = {
  SU: { winning: "winning", losing: "losing", even: "tied" },
  ATS: { winning: "covering", losing: "not covering", even: "right on the spread" },
};

function formatKickoff(iso: string) {
  return formatEastern(iso, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

interface GameCardProps {
  game: Game;
  pick?: Pick | null;
  selectedTeam?: string | null;
  unsaved?: boolean;
  locked: boolean;
  // True when this game has started but the rest of the week is still open.
  kickedOff?: boolean;
  // Unofficial ESPN score while the game is in progress or awaiting grading.
  live?: LiveScore;
  onSelect?: (selectedTeam: string) => void;
}

export function GameCard({ game, pick, selectedTeam, unsaved, locked, kickedOff, live, onSelect }: GameCardProps) {
  const isFavoriteAway = game.favoriteTeam === game.awayTeam;
  // Always show the spread as reference info, even for straight-up games —
  // it just isn't the basis for grading unless pickType is "ATS".
  const awayLine = isFavoriteAway ? `-${game.spread}` : `+${game.spread}`;
  const homeLine = isFavoriteAway ? `+${game.spread}` : `-${game.spread}`;

  const graded = game.status === "final" && pick?.pointsEarned != null;

  // Before grading, show the saved final score if there is one, else ESPN's.
  const score: LiveScore | undefined = graded
    ? undefined
    : game.status === "final" && game.awayScore != null && game.homeScore != null
      ? { state: "post", awayScore: game.awayScore, homeScore: game.homeScore, detail: "Final" }
      : live;
  const pickStatus =
    score && selectedTeam && !unsaved ? livePickStatus(game, selectedTeam, score.awayScore, score.homeScore) : null;

  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid={`card-game-${game.id}`}>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {formatKickoff(game.kickoff)}
          {kickedOff && !graded && !score && (
            <span className="ml-1.5 font-medium" data-testid={`text-kicked-off-${game.id}`}>
              · Kicked off, locked
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {game.broadcast && (
            <span className="flex items-center gap-1">
              <Tv className="h-3 w-3" /> {game.broadcast}
            </span>
          )}
          <Badge variant="outline" className="text-[10px]">
            {game.pickType === "ATS" ? "Against the spread" : "Straight up"}
          </Badge>
          {game.isMoneyGame && (
            <Badge className="gap-1 bg-accent text-accent-foreground text-[10px]" data-testid={`badge-money-${game.id}`}>
              <Coins className="h-3 w-3" /> Money game · 2pts
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { team: game.awayTeam, rank: game.awayRank, line: awayLine },
          { team: game.homeTeam, rank: game.homeRank, line: homeLine },
        ].map(({ team, rank, line }) => {
          const selected = selectedTeam === team;
          return (
            <Button
              key={team}
              type="button"
              variant={selected ? "default" : "outline"}
              disabled={locked}
              onClick={() => onSelect?.(team)}
              className={cn(
                "h-auto flex-col items-center gap-0.5 py-3 whitespace-normal text-center",
                graded && selected && pick?.isCorrect && "ring-2 ring-primary",
                graded && selected && pick?.isCorrect === false && "ring-2 ring-destructive",
              )}
              data-testid={`button-pick-${game.id}-${team.replace(/\s/g, "-")}`}
            >
              <span className="text-sm font-semibold leading-tight">{teamLabel(team, rank)}</span>
              <span className="text-xs opacity-80">{line}</span>
            </Button>
          );
        })}
      </div>

      {graded && pick && (
        <div className="mt-3 flex items-center gap-1.5 text-sm">
          {pick.isCorrect ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <X className="h-4 w-4 text-destructive" />
          )}
          <span className={pick.isCorrect ? "text-primary font-medium" : "text-destructive font-medium"}>
            {pick.isCorrect ? `+${pick.pointsEarned} point${pick.pointsEarned === 1 ? "" : "s"}` : "0 points"}
          </span>
          {game.awayScore != null && game.homeScore != null && (
            <span className="text-muted-foreground">
              · Final: {game.awayTeam} {game.awayScore} – {game.homeTeam} {game.homeScore}
            </span>
          )}
        </div>
      )}

      {score && (
        <div className="mt-3 flex flex-col gap-1 text-sm" data-testid={`text-live-score-${game.id}`}>
          <div className="flex flex-wrap items-center gap-x-1.5">
            {score.state === "in" ? (
              <span className="flex items-center gap-1 text-xs font-semibold uppercase text-destructive">
                <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> Live
              </span>
            ) : (
              <span className="text-xs font-semibold uppercase text-muted-foreground">Final</span>
            )}
            <span className="font-medium">
              {game.awayTeam} {score.awayScore} – {game.homeTeam} {score.homeScore}
            </span>
            {score.state === "in" && <span className="text-xs text-muted-foreground">· {score.detail}</span>}
          </div>
          {pickStatus && selectedTeam && (
            <span
              className={cn(
                "text-xs font-medium",
                pickStatus === "winning" && "text-primary",
                pickStatus === "losing" && "text-destructive",
                pickStatus === "even" && "text-muted-foreground",
              )}
              data-testid={`text-live-pick-status-${game.id}`}
            >
              Your pick, {selectedTeam}, is {LIVE_STATUS_TEXT[game.pickType][pickStatus]}
              {score.state === "post" && " · unofficial until the week is graded"}
            </span>
          )}
        </div>
      )}

      {!graded && kickedOff && !selectedTeam && (
        <p className="mt-3 text-xs text-muted-foreground">No pick made before kickoff.</p>
      )}
      {!graded && selectedTeam && !pickStatus && (
        <p className={cn("mt-3 text-xs", unsaved ? "font-medium text-accent" : "text-muted-foreground")}>
          {unsaved ? `${selectedTeam} selected \u2014 not saved yet` : `You picked ${selectedTeam}.`}
        </p>
      )}
    </div>
  );
}
