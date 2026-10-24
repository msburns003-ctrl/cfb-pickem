import { livePickStatus, upsetPickPoints, type LivePickStatus } from "@shared/outcome";
import type { Game, LiveScore } from "@shared/schema";

// Saved final score if there is one, else ESPN's live score. Graded games
// need neither: their picks already show the official result.
export function scoreFor(game: Game, live: Record<number, LiveScore>): LiveScore | undefined {
  if (game.status === "final" && game.awayScore != null && game.homeScore != null) {
    return { state: "post", awayScore: game.awayScore, homeScore: game.homeScore, detail: "Final" };
  }
  return live[game.id];
}

export interface WeekTally {
  wins: number;
  losses: number;
  liveWinning: number;
  liveLosing: number;
  liveEven: number;
  upsetLive: LivePickStatus | null;
  officialPoints: number;
  // Official points plus what ungraded picks would earn if current scores hold.
  projectedPoints: number;
}

interface UpsetInput {
  result: "pending" | "win" | "loss" | "push";
  spread: number;
  underdogTeam: string;
  game: Game | undefined;
}

// One member's week so far: graded record, how ungraded picks stand at the
// current score, and projected points under the league's scoring rules.
export function tallyWeek(
  games: Game[],
  picks: Record<number, { selectedTeam: string; isCorrect: boolean | null } | undefined>,
  officialPoints: number,
  upset: UpsetInput | null,
  live: Record<number, LiveScore>,
): WeekTally {
  const tally: WeekTally = {
    wins: 0,
    losses: 0,
    liveWinning: 0,
    liveLosing: 0,
    liveEven: 0,
    upsetLive: null,
    officialPoints,
    projectedPoints: officialPoints,
  };

  for (const game of games) {
    const pick = picks[game.id];
    if (!pick) continue;
    if (pick.isCorrect != null) {
      if (pick.isCorrect) tally.wins++;
      else tally.losses++;
      continue;
    }
    const score = scoreFor(game, live);
    if (!score) continue;
    const status = livePickStatus(game, pick.selectedTeam, score.awayScore, score.homeScore);
    if (status === "winning") {
      tally.liveWinning++;
      tally.projectedPoints += game.isMoneyGame ? 2 : 1;
    } else if (status === "losing") {
      tally.liveLosing++;
    } else {
      tally.liveEven++;
    }
  }

  // Upset picks win only if the underdog wins outright.
  const upsetScore = upset?.game ? scoreFor(upset.game, live) : undefined;
  if (upset?.game && upset.result === "pending" && upsetScore) {
    const underdogIsAway = upset.game.awayTeam === upset.underdogTeam;
    const underdog = underdogIsAway ? upsetScore.awayScore : upsetScore.homeScore;
    const favorite = underdogIsAway ? upsetScore.homeScore : upsetScore.awayScore;
    tally.upsetLive = underdog > favorite ? "winning" : underdog < favorite ? "losing" : "even";
    if (tally.upsetLive === "winning") tally.projectedPoints += upsetPickPoints(upset.spread);
  }

  return tally;
}
