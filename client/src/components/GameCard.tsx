import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tv, Check, X, Coins } from "lucide-react";
import type { Game, Pick } from "@shared/schema";

function teamLabel(team: string, rank: number | null) {
  return rank ? `#${rank} ${team}` : team;
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

interface GameCardProps {
  game: Game;
  pick?: Pick | null;
  locked: boolean;
  onPick?: (selectedTeam: string) => void;
  submitting?: boolean;
}

export function GameCard({ game, pick, locked, onPick, submitting }: GameCardProps) {
  const isFavoriteAway = game.favoriteTeam === game.awayTeam;
  // Always show the spread as reference info, even for straight-up games —
  // it just isn't the basis for grading unless pickType is "ATS".
  const awayLine = isFavoriteAway ? `-${game.spread}` : `+${game.spread}`;
  const homeLine = isFavoriteAway ? `+${game.spread}` : `-${game.spread}`;

  const graded = game.status === "final" && pick?.pointsEarned != null;

  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid={`card-game-${game.id}`}>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{formatKickoff(game.kickoff)}</span>
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
          const selected = pick?.selectedTeam === team;
          const isWinner = graded && game.winner === team;
          return (
            <Button
              key={team}
              type="button"
              variant={selected ? "default" : "outline"}
              disabled={locked || submitting}
              onClick={() => onPick?.(team)}
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

      {!graded && pick && (
        <p className="mt-3 text-xs text-muted-foreground">You picked {pick.selectedTeam}.</p>
      )}
    </div>
  );
}
