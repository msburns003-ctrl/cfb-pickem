import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEastern } from "@/lib/time";
import { livePickStatus, type LivePickStatus } from "@shared/outcome";
import { Check, Coins, TrendingUp, Trophy, X } from "lucide-react";
import type { Game, LiveScore } from "@shared/schema";
import type { GridResponse, GridRow } from "@/lib/grid-pdf";
import { scoreFor, type WeekTally } from "@/lib/projection";

function teamLabel(team: string, rank: number | null) {
  return rank ? `#${rank} ${team}` : team;
}

// Official result once graded, else unofficial status from the current score.
type PickResult = { kind: "official"; correct: boolean } | { kind: "live"; status: LivePickStatus } | null;

function pickResult(game: Game, pick: GridRow["picks"][number], score: LiveScore | undefined): PickResult {
  if (pick.isCorrect != null) return { kind: "official", correct: pick.isCorrect };
  if (score) return { kind: "live", status: livePickStatus(game, pick.selectedTeam, score.awayScore, score.homeScore) };
  return null;
}

function NameChip({ name, isYou, result }: { name: string; isYou: boolean; result: PickResult }) {
  const good = (result?.kind === "official" && result.correct) || (result?.kind === "live" && result.status === "winning");
  const bad = (result?.kind === "official" && !result.correct) || (result?.kind === "live" && result.status === "losing");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        good ? "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400" : bad ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border",
        result?.kind === "live" && "italic",
        isYou && "font-semibold ring-1 ring-primary",
      )}
    >
      {result?.kind === "official" && (result.correct ? <Check className="h-3 w-3" aria-label="correct" /> : <X className="h-3 w-3" aria-label="incorrect" />)}
      {name}
      {isYou && " (you)"}
    </span>
  );
}

function rankRows(rows: GridRow[], points: (row: GridRow) => number) {
  const sorted = [...rows].sort((a, b) => points(b) - points(a));
  // Tied members share the same rank.
  return sorted.map((row) => ({ row, rank: sorted.findIndex((r) => points(r) === points(row)) + 1 }));
}

const LEADERBOARD_PREVIEW = 5;

function WeekLeaderboard({
  rows,
  currentUserId,
  projected,
}: {
  rows: GridRow[];
  currentUserId: number | undefined;
  projected: Map<number, WeekTally> | null;
}) {
  const [showAll, setShowAll] = useState(false);
  // While games are live, rank by projected points so this works as a live leaderboard.
  const pointsOf = (row: GridRow) => (projected ? projected.get(row.userId)?.projectedPoints ?? row.weekPoints : row.weekPoints);
  const ranked = rankRows(rows, pointsOf);
  const visible = showAll
    ? ranked
    : ranked.filter((r, i) => i < LEADERBOARD_PREVIEW || r.row.userId === currentUserId);

  return (
    <div className="rounded-lg border border-card-border bg-card p-3" data-testid="card-grid-leaderboard">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Trophy className="h-4 w-4 text-accent" /> This week's points
        {projected && <span className="ml-auto text-xs font-normal italic text-muted-foreground">projected · official</span>}
      </h2>
      <ol className="flex flex-col text-sm">
        {visible.map(({ row, rank }, i) => (
          <li
            key={row.userId}
            className={cn(
              "flex items-center justify-between gap-2 rounded px-1.5 py-1",
              row.userId === currentUserId && "bg-primary/5 font-semibold",
              // Separate "you" from the preview when you're outside the top five.
              !showAll && i === LEADERBOARD_PREVIEW && "mt-1 border-t border-card-border pt-2",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{rank}</span>
              <span className="truncate">
                {row.name}
                {row.userId === currentUserId && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
              </span>
            </span>
            {projected ? (
              <span className="shrink-0 tabular-nums">
                <span className="italic">{pointsOf(row)}</span>
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {row.weekPoints}</span>
              </span>
            ) : (
              <span className="shrink-0 tabular-nums">{row.weekPoints}</span>
            )}
          </li>
        ))}
      </ol>
      {ranked.length > LEADERBOARD_PREVIEW && (
        <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setShowAll((v) => !v)} data-testid="button-leaderboard-toggle">
          {showAll ? "Show less" : `Show all ${ranked.length}`}
        </Button>
      )}
    </div>
  );
}

function GameBlock({ game, data, score, currentUserId }: { game: Game; data: GridResponse; score: LiveScore | undefined; currentUserId: number | undefined }) {
  const consensus = data.consensus[game.id];
  const isFavoriteAway = game.favoriteTeam === game.awayTeam;
  const sides = [
    { team: game.awayTeam, rank: game.awayRank, line: isFavoriteAway ? `-${game.spread}` : `+${game.spread}`, pct: consensus?.awayPct ?? 0 },
    { team: game.homeTeam, rank: game.homeRank, line: isFavoriteAway ? `+${game.spread}` : `-${game.spread}`, pct: consensus?.homePct ?? 0 },
  ];
  const noPick = data.grid.filter((row) => !row.picks[game.id]);

  return (
    <div className="rounded-lg border border-card-border bg-card p-3" data-testid={`card-grid-game-${game.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {formatEastern(game.kickoff, { weekday: "short", hour: "numeric", minute: "2-digit" })} ·{" "}
          {game.pickType === "ATS" ? "Against the spread" : "Straight up"}
        </span>
        {game.isMoneyGame && (
          <Badge className="gap-1 bg-accent text-[10px] text-accent-foreground">
            <Coins className="h-3 w-3" /> Money game
          </Badge>
        )}
      </div>

      {score && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm" data-testid={`text-grid-game-score-${game.id}`}>
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
      )}

      {consensus && consensus.totalPicks > 0 && (
        <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-accent/70" style={{ width: `${consensus.awayPct}%` }} />
          <div className="h-full bg-secondary" style={{ width: `${consensus.homePct}%` }} />
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-3">
        {sides.map((side) => {
          const pickers = data.grid.filter((row) => row.picks[game.id]?.selectedTeam === side.team);
          return (
            <div key={side.team} className="min-w-0">
              <div className="mb-1.5 text-sm font-semibold leading-tight">{teamLabel(side.team, side.rank)}</div>
              <div className="mb-1.5 text-xs text-muted-foreground">
                {side.line} · {pickers.length} pick{pickers.length === 1 ? "" : "s"}
                {consensus && consensus.totalPicks > 0 && ` (${side.pct}%)`}
              </div>
              <div className="flex flex-wrap gap-1">
                {pickers.map((row) => (
                  <NameChip
                    key={row.userId}
                    name={row.name}
                    isYou={row.userId === currentUserId}
                    result={pickResult(game, row.picks[game.id], score)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {noPick.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">No pick: {noPick.map((r) => r.name).join(", ")}</p>
      )}
    </div>
  );
}

function UpsetBlock({ data, liveScores, currentUserId }: { data: GridResponse; liveScores: Record<number, LiveScore>; currentUserId: number | undefined }) {
  const withUpset = data.grid.filter((row) => row.upsetPick);
  if (withUpset.length === 0) return null;
  const byTeam = new Map<string, GridRow[]>();
  for (const row of withUpset) {
    const team = row.upsetPick!.underdogTeam;
    byTeam.set(team, [...(byTeam.get(team) ?? []), row]);
  }
  const teams = Array.from(byTeam.entries()).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="rounded-lg border border-card-border bg-card p-3" data-testid="card-grid-upsets">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <TrendingUp className="h-4 w-4" /> Upset picks
      </h2>
      <div className="flex flex-col gap-2.5">
        {teams.map(([team, rows]) => {
          const up = rows[0].upsetPick!;
          const game = data.upsetGames?.find((g) => g.id === up.gameId);
          const score = game ? scoreFor(game, liveScores) : undefined;
          let result: PickResult =
            up.result === "win" ? { kind: "official", correct: true } : up.result === "loss" ? { kind: "official", correct: false } : null;
          if (up.result === "pending" && game && score) {
            // Upset picks win only if the underdog wins outright.
            const underdogIsAway = game.awayTeam === team;
            const diff = underdogIsAway ? score.awayScore - score.homeScore : score.homeScore - score.awayScore;
            result = { kind: "live", status: diff > 0 ? "winning" : diff < 0 ? "losing" : "even" };
          }
          return (
            <div key={team}>
              <div className="mb-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{team}</span> +{up.spread} vs {up.favoriteTeam}
                {up.result === "win" && ` · +${up.pointsEarned}`}
                {up.result === "push" && " · push"}
                {up.result === "pending" && score && (
                  <span className={score.state === "in" ? "text-destructive" : undefined}>
                    {" "}
                    · {score.state === "in" ? "Live" : "Final"} {score.awayScore}–{score.homeScore}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {rows.map((row) => (
                  <NameChip key={row.userId} name={row.name} isYou={row.userId === currentUserId} result={result} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Phone layout for the picks grid: one card per game listing who picked
// each side, plus the week's points and upset picks.
export function GridByGame({
  data,
  liveScores,
  currentUserId,
  projected,
}: {
  data: GridResponse;
  liveScores: Record<number, LiveScore>;
  currentUserId: number | undefined;
  projected: Map<number, WeekTally> | null;
}) {
  const hasUnofficial = data.games.some((g) => {
    const score = scoreFor(g, liveScores);
    return !!score && data.grid.some((row) => row.picks[g.id] && row.picks[g.id].isCorrect == null);
  });

  return (
    <div className="flex flex-col gap-3" data-testid="grid-by-game">
      <WeekLeaderboard rows={data.grid} currentUserId={currentUserId} projected={projected} />
      {data.games.map((game) => (
        <GameBlock key={game.id} game={game} data={data} score={scoreFor(game, liveScores)} currentUserId={currentUserId} />
      ))}
      <UpsetBlock data={data} liveScores={liveScores} currentUserId={currentUserId} />
      {hasUnofficial && (
        <p className="text-xs text-muted-foreground">
          <span className="italic">Italic</span> names are unofficial, based on the current score. Points count once the week is graded.
        </p>
      )}
    </div>
  );
}
