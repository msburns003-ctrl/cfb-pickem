import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flame, Check, X } from "lucide-react";
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
  const openGames = availableGames.filter(notStarted);
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
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selectedGameId} onValueChange={setSelectedGameId} disabled={locked}>
            <SelectTrigger className="flex-1" data-testid="select-upset-game">
              <SelectValue placeholder="Choose a game and underdog..." />
            </SelectTrigger>
            <SelectContent>
              {openGames.map((g) => {
                const underdogIsAway = g.favoriteTeam !== g.awayTeam;
                const underdog = underdogIsAway ? g.awayTeam : g.homeTeam;
                const underdogRank = underdogIsAway ? g.awayRank : g.homeRank;
                const favoriteRank = underdogIsAway ? g.homeRank : g.awayRank;
                const pts = upsetPickPoints(g.spread);
                return (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {teamLabel(underdog, underdogRank)} (+{g.spread}) vs {teamLabel(g.favoriteTeam, favoriteRank)} — {pts} pt{pts === 1 ? "" : "s"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
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
      )}
    </div>
  );
}
