import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEastern } from "@/lib/time";
import type { Game, UpsetPick } from "@shared/schema";

function teamLabel(team: string, rank: number | null) {
  return rank ? `#${rank} ${team}` : team;
}

function upsetPickPoints(spread: number): number {
  const s = Math.abs(spread);
  if (s >= 15) return 3;
  if (s >= 7.5) return 2;
  if (s >= 0.5) return 1;
  return 0;
}

interface UpsetPickPanelProps {
  availableGames: Game[];
  myUpsetPick: UpsetPick | null;
  locked: boolean;
  now: number;
  onSubmit: (gameId: number) => void;
  submitting?: boolean;
}

export function UpsetPickPanel({ availableGames, myUpsetPick, locked, now, onSubmit, submitting }: UpsetPickPanelProps) {
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [editing, setEditing] = useState(false);

  // A new submission (optimistic or real) closes the change form.
  useEffect(() => {
    setEditing(false);
    setSelectedGameId("");
  }, [myUpsetPick?.submittedAt]);

  const notStarted = (g: Game) => now < new Date(g.kickoff).getTime();
  // Only games that haven't kicked off can be chosen; the server rejects the rest.
  const openGames = availableGames.filter(notStarted).sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.spread - b.spread);
  const chosenGame = openGames.find((g) => String(g.id) === selectedGameId);
  const chosen = chosenGame && {
    game: chosenGame,
    underdog: chosenGame.favoriteTeam === chosenGame.awayTeam ? chosenGame.homeTeam : chosenGame.awayTeam,
    points: upsetPickPoints(chosenGame.spread),
  };
  // Grouped by kickoff day (Eastern) so a long list is easy to scan.
  const byDay = new Map<string, Game[]>();
  for (const g of openGames) {
    const day = formatEastern(g.kickoff, { weekday: "short", month: "short", day: "numeric" });
    byDay.set(day, [...(byDay.get(day) ?? []), g]);
  }
  const pickedGame = myUpsetPick ? availableGames.find((g) => g.id === myUpsetPick.gameId) : undefined;
  // The current pick can be swapped until the week locks or its game kicks off.
  const canChange = !locked && !!myUpsetPick && myUpsetPick.result === "pending" && !!pickedGame && notStarted(pickedGame);

  if (myUpsetPick && (!editing || !canChange)) {
    const game = pickedGame;
    const graded = myUpsetPick.result !== "pending";
    return (
      <div className="rounded-lg border border-card-border bg-card p-4" data-testid="card-upset-pick-submitted">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Flame className="h-3.5 w-3.5" /> Underdog bonus pick
        </div>
        <p className="mt-2 text-sm font-semibold" data-testid="text-upset-pick-team">
          {teamLabel(
            myUpsetPick.underdogTeam,
            game && myUpsetPick.underdogTeam === game.awayTeam ? game.awayRank : game?.homeRank ?? null,
          )}{" "}
          <span className="text-muted-foreground">+{myUpsetPick.spread}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          vs. {teamLabel(
            myUpsetPick.favoriteTeam,
            game && myUpsetPick.favoriteTeam === game.awayTeam ? game.awayRank : game?.homeRank ?? null,
          )}{" "}
          · worth {upsetPickPoints(myUpsetPick.spread)} point
          {upsetPickPoints(myUpsetPick.spread) === 1 ? "" : "s"} if they win outright
        </p>
        {graded && (
          <div className="mt-2 flex items-center gap-1.5 text-sm">
            {myUpsetPick.result === "win" ? (
              <>
                <Check className="h-4 w-4 text-primary" />
                <span className="font-medium text-primary">+{myUpsetPick.pointsEarned} points</span>
              </>
            ) : myUpsetPick.result === "push" ? (
              <span className="font-medium text-muted-foreground">Push · 0 points</span>
            ) : (
              <>
                <X className="h-4 w-4 text-destructive" />
                <span className="font-medium text-destructive">0 points</span>
              </>
            )}
          </div>
        )}
        {game && game.status === "final" && game.awayScore != null && (
          <p className="mt-1 text-xs text-muted-foreground">
            Final: {game.awayTeam} {game.awayScore} – {game.homeTeam} {game.homeScore}
          </p>
        )}
        {canChange && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setEditing(true)}
            data-testid="button-change-upset-pick"
          >
            Change pick
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid="card-upset-pick-entry">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Flame className="h-3.5 w-3.5" /> Underdog bonus pick
      </div>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        Pick one underdog from any game not already on this week&apos;s slate. Score 1–3 points if they win outright,
        based on how big the spread is.
      </p>
      {openGames.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {availableGames.length === 0 ? "No other games available this week." : "All other games this week have kicked off."}
        </p>
      ) : (
        <>
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* A native <select>: phones show their own picker (the iOS wheel, the
              Android list), which always scrolls, even with dozens of games. */}
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            disabled={locked}
            aria-label="Choose a game and underdog"
            className={cn(
              "h-10 w-full min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground sm:text-sm", // 16px on phones: iOS zooms smaller fields
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              !selectedGameId && "text-muted-foreground",
            )}
            data-testid="select-upset-game"
          >
            <option value="" disabled>
              Choose a game and underdog...
            </option>
            {Array.from(byDay.entries()).map(([day, games]) => (
              <optgroup key={day} label={day.replace(/ ET$/, "")}>
                {games.map((g) => {
                  const underdogIsAway = g.favoriteTeam !== g.awayTeam;
                  const underdog = underdogIsAway ? g.awayTeam : g.homeTeam;
                  const underdogRank = underdogIsAway ? g.awayRank : g.homeRank;
                  const favoriteRank = underdogIsAway ? g.homeRank : g.awayRank;
                  const pts = upsetPickPoints(g.spread);
                  return (
                    <option key={g.id} value={String(g.id)}>
                      {teamLabel(underdog, underdogRank)} (+{g.spread}) vs {teamLabel(g.favoriteTeam, favoriteRank)} — {pts} pt
                      {pts === 1 ? "" : "s"}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
          <Button
            disabled={locked || !selectedGameId || submitting}
            onClick={() => selectedGameId && onSubmit(Number(selectedGameId))}
            data-testid="button-submit-upset-pick"
          >
            Lock In
          </Button>
          {myUpsetPick && (
            <Button variant="ghost" onClick={() => setEditing(false)} data-testid="button-cancel-upset-change">
              Cancel
            </Button>
          )}
        </div>
        {chosen && (
          // The picker's label can be cut off on a narrow phone, so spell out the choice.
          <p className="mt-2 text-xs text-muted-foreground" data-testid="text-upset-choice">
            <span className="font-medium text-foreground">{chosen.underdog}</span> +{chosen.game.spread} vs {chosen.game.favoriteTeam} · worth{" "}
            {chosen.points} point{chosen.points === 1 ? "" : "s"} if they win outright
          </p>
        )}
        </>
      )}
    </div>
  );
}
