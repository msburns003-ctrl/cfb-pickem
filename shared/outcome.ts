import type { AtsResult, Game } from "./schema";

type GameLine = Pick<Game, "awayTeam" | "homeTeam" | "favoriteTeam" | "spread" | "pickType">;

/**
 * Winner and ATS result for a given score. Grading uses this on final scores;
 * the live view uses it on in-progress scores, so both always follow the same
 * league rules.
 */
export function outcomeFromScores(game: GameLine, awayScore: number, homeScore: number) {
  const winner = awayScore > homeScore ? game.awayTeam : homeScore > awayScore ? game.homeTeam : null; // null = tie (rare in CFB, treat as push-ish)

  const favoriteIsAway = game.favoriteTeam === game.awayTeam;
  const favoriteScore = favoriteIsAway ? awayScore : homeScore;
  const underdogScore = favoriteIsAway ? homeScore : awayScore;
  const favoriteMargin = favoriteScore - underdogScore;

  let atsResult: AtsResult;
  if (favoriteMargin === game.spread) {
    atsResult = "push";
  } else if (favoriteMargin > game.spread) {
    atsResult = "favorite";
  } else {
    atsResult = "underdog";
  }

  return { winner, atsResult };
}

/** The team that covered, or null on a push. */
export function coveringTeam(game: GameLine, atsResult: AtsResult): string | null {
  if (atsResult === "push") return null;
  if (atsResult === "favorite") return game.favoriteTeam;
  return game.awayTeam === game.favoriteTeam ? game.homeTeam : game.awayTeam;
}

export type LivePickStatus = "winning" | "losing" | "even";

/** How a pick stands at the current score, using the game's SU/ATS rule. */
export function livePickStatus(game: GameLine, selectedTeam: string, awayScore: number, homeScore: number): LivePickStatus {
  const { winner, atsResult } = outcomeFromScores(game, awayScore, homeScore);
  if (atsResult === "push") return "even";
  const leader = game.pickType === "SU" ? winner : coveringTeam(game, atsResult);
  if (leader === null) return "even";
  return leader === selectedTeam ? "winning" : "losing";
}

/** Tiered points for a winning underdog bonus pick, based on the spread magnitude. */
export function upsetPickPoints(spread: number): number {
  const s = Math.abs(spread);
  if (s >= 15) return 3;
  if (s >= 7.5) return 2;
  if (s >= 0.5) return 1;
  return 0;
}
