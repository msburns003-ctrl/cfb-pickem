import { storage } from "./storage";
import type {
  Game,
  CristoBallEntry,
  CristoBallResults,
  CristoBallPointsBreakdown,
} from "@shared/schema";
import {
  CRISTO_BALL_CATEGORIES,
  CRISTO_BALL_SEASON_QUESTIONS,
  CRISTO_BALL_NATIONAL_CHAMP_POINTS,
  CRISTO_BALL_PLAYOFF_TEAM_POINTS,
} from "@shared/schema";

export const ATS_THRESHOLD = 5.5; // spread magnitude above which a pick is ATS instead of straight-up

export function computePickType(spread: number): "SU" | "ATS" {
  return Math.abs(spread) > ATS_THRESHOLD ? "ATS" : "SU";
}

/**
 * Determines the winner and ATS result of a finished game.
 */
export function gradeGameOutcome(game: Game) {
  if (game.awayScore == null || game.homeScore == null) {
    throw new Error("Game is missing final score");
  }
  const winner = game.awayScore > game.homeScore ? game.awayTeam : game.homeScore > game.awayScore ? game.homeTeam : null; // null = tie (rare in CFB, treat as push-ish)

  const favoriteIsAway = game.favoriteTeam === game.awayTeam;
  const favoriteScore = favoriteIsAway ? game.awayScore : game.homeScore;
  const underdogScore = favoriteIsAway ? game.homeScore : game.awayScore;
  const favoriteMargin = favoriteScore - underdogScore;

  let atsResult: "favorite" | "underdog" | "push";
  if (favoriteMargin === game.spread) {
    atsResult = "push";
  } else if (favoriteMargin > game.spread) {
    atsResult = "favorite";
  } else {
    atsResult = "underdog";
  }

  return { winner, atsResult };
}

/**
 * Grades every submitted pick for a week's selected games, assigns money-game
 * bonuses based on the most evenly-split games, and grades the bonus upset pick.
 * Call once all selected games for the week are marked final with scores.
 */
export async function gradeWeek(weekId: number) {
  const week = await storage.getWeek(weekId);
  if (!week) throw new Error("Week not found");

  const allGames = await storage.listGamesByWeek(weekId);
  const selectedGames = allGames.filter((g) => g.isSelected);
  const unfinished = selectedGames.filter((g) => g.status !== "final");
  if (unfinished.length > 0) {
    throw new Error(`${unfinished.length} selected game(s) are not yet final`);
  }

  const weekPicks = await storage.listPicksByWeek(weekId);

  // 1. Determine winner/ATS result per game, and correctness per pick
  const gameResults = new Map<number, { winner: string | null; atsResult: "favorite" | "underdog" | "push" }>();
  for (const game of selectedGames) {
    const result = gradeGameOutcome(game);
    gameResults.set(game.id, result);
    await storage.updateGame(game.id, { winner: result.winner ?? undefined, atsResult: result.atsResult });
  }

  // 2. Determine money games: the N selected games whose picks are most evenly split
  //    (smallest absolute difference between the two side pick-counts).
  const splitDiff = new Map<number, number>();
  for (const game of selectedGames) {
    const gamePicks = weekPicks.filter((p) => p.gameId === game.id);
    const teamACount = gamePicks.filter((p) => p.selectedTeam === game.awayTeam).length;
    const teamBCount = gamePicks.filter((p) => p.selectedTeam === game.homeTeam).length;
    splitDiff.set(game.id, Math.abs(teamACount - teamBCount));
  }
  const moneyGameIds = new Set(
    [...selectedGames]
      .sort((a, b) => (splitDiff.get(a.id) ?? 0) - (splitDiff.get(b.id) ?? 0))
      .slice(0, Math.max(0, week.moneyGameCount))
      .map((g) => g.id),
  );
  for (const game of selectedGames) {
    await storage.updateGame(game.id, { isMoneyGame: moneyGameIds.has(game.id) });
  }

  // 3. Grade each pick
  for (const game of selectedGames) {
    const result = gameResults.get(game.id)!;
    const gamePicks = weekPicks.filter((p) => p.gameId === game.id);
    const isMoneyGame = moneyGameIds.has(game.id);
    for (const pick of gamePicks) {
      let isCorrect: boolean;
      if (result.atsResult === "push") {
        isCorrect = false; // pushes earn nobody points
      } else if (game.pickType === "SU") {
        isCorrect = pick.selectedTeam === result.winner;
      } else {
        // ATS: correct if you picked the side that covered
        const coveringTeam = result.atsResult === "favorite" ? game.favoriteTeam : game.awayTeam === game.favoriteTeam ? game.homeTeam : game.awayTeam;
        isCorrect = pick.selectedTeam === coveringTeam;
      }
      const pointsEarned = isCorrect ? (isMoneyGame ? 2 : 1) : 0;
      await storage.updatePick(pick.id, { isCorrect, pointsEarned });
    }
  }

  // 4. Grade the bonus upset pick for the week
  const weekUpsetPicks = await storage.listUpsetPicksByWeek(weekId);
  for (const up of weekUpsetPicks) {
    const game = await storage.getGame(up.gameId);
    if (!game || game.status !== "final" || game.awayScore == null || game.homeScore == null) continue;
    const result = gradeGameOutcome(game);
    let outcome: "win" | "loss" | "push";
    let pointsEarned = 0;
    if (result.winner === null) {
      outcome = "push";
    } else if (result.winner === up.underdogTeam) {
      outcome = "win";
      pointsEarned = upsetPickPoints(up.spread);
    } else {
      outcome = "loss";
    }
    await storage.updateUpsetPick(up.id, { result: outcome, pointsEarned });
  }

  await storage.updateWeek(weekId, { status: "graded" });
}

/** Tiered points for a winning underdog bonus pick, based on the spread magnitude. */
export function upsetPickPoints(spread: number): number {
  const s = Math.abs(spread);
  if (s >= 15) return 3;
  if (s >= 7.5) return 2;
  if (s >= 0.5) return 1;
  return 0;
}

export interface StandingsRow {
  userId: number;
  name: string;
  weeklyPoints: Record<number, number>; // weekId -> points
  cristoBallPoints: number | null; // null = not graded yet
  totalPoints: number;
  rank: number;
  previousRank: number | null; // rank as of the prior graded week; null if not enough graded weeks yet
}

/**
 * Determines the season year standings/Cristo-Ball should key off of: the most
 * recent season represented among existing weeks, falling back to the current
 * calendar year if no weeks exist yet.
 */
export async function getCurrentSeasonYear(): Promise<number> {
  const allWeeks = await storage.listWeeks();
  if (allWeeks.length === 0) return new Date().getFullYear();
  return Math.max(...allWeeks.map((w) => w.seasonYear));
}

/**
 * The Cristo-Ball entry lock deadline mirrors the earliest weekly pick
 * deadline in the season (i.e. Week 1's deadline) — entries lock at the same
 * moment the season's first games kick off. Returns null if no weeks exist.
 */
export async function getCristoBallLockDeadline(seasonYear: number): Promise<string | null> {
  const allWeeks = await storage.listWeeks();
  const seasonWeeks = allWeeks.filter((w) => w.seasonYear === seasonYear);
  if (seasonWeeks.length === 0) return null;
  return seasonWeeks.reduce((earliest, w) => (w.pickDeadline < earliest ? w.pickDeadline : earliest), seasonWeeks[0].pickDeadline);
}

function normalizeAnswer(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Grades a single Cristo-Ball entry against the season's actual results.
 * Conference champs and season yes/no questions require an exact match;
 * national champ and playoff-field picks use case-insensitive/trimmed text
 * matching so minor formatting differences ("Ohio St" vs "Ohio State") don't
 * need admin intervention as long as the wording matches.
 */
export function gradeCristoBallEntry(
  entry: CristoBallEntry,
  results: CristoBallResults,
): { total: number; breakdown: CristoBallPointsBreakdown } {
  const conferencePoints: Record<string, number> = {};
  for (const cat of CRISTO_BALL_CATEGORIES) {
    const actual = results.actualPicks[cat.key];
    const pick = entry.picks[cat.key];
    conferencePoints[cat.key] = actual && pick && normalizeAnswer(actual) === normalizeAnswer(pick) ? cat.points : 0;
  }

  const seasonAnswerPoints: Record<string, number> = {};
  for (const q of CRISTO_BALL_SEASON_QUESTIONS) {
    const actual = results.actualSeasonAnswers[q.key];
    const answer = entry.seasonAnswers[q.key];
    seasonAnswerPoints[q.key] = actual !== null && actual !== undefined && answer === actual ? q.points : 0;
  }

  const nationalChampPoints =
    results.actualNationalChamp &&
    entry.nationalChampPick &&
    normalizeAnswer(results.actualNationalChamp) === normalizeAnswer(entry.nationalChampPick)
      ? CRISTO_BALL_NATIONAL_CHAMP_POINTS
      : 0;

  const actualPlayoffSet = new Set((results.actualPlayoffTeams ?? []).map(normalizeAnswer).filter(Boolean));
  const playoffMatches = (entry.playoffPicks ?? []).filter((p) => actualPlayoffSet.has(normalizeAnswer(p))).length;
  const playoffPoints = playoffMatches * CRISTO_BALL_PLAYOFF_TEAM_POINTS;

  const breakdown: CristoBallPointsBreakdown = {
    conferencePoints,
    seasonAnswerPoints,
    nationalChampPoints,
    playoffPoints,
  };

  const total =
    Object.values(conferencePoints).reduce((a, b) => a + b, 0) +
    Object.values(seasonAnswerPoints).reduce((a, b) => a + b, 0) +
    nationalChampPoints +
    playoffPoints;

  return { total, breakdown };
}

/**
 * Computes season standings. By default, across all graded weeks, plus
 * Cristo-Ball points once Cristo-Ball has been graded. Ties share the same
 * rank (no tiebreaker), matching the league's historical convention.
 *
 * When `weekIdsFilter` is provided, only picks/upset picks from those weeks
 * are accumulated (used to reconstruct "standings as of a prior week" for
 * rank-change comparisons); Cristo-Ball points are always included once
 * graded, since Cristo-Ball is a single season-long lump sum rather than a
 * per-week component.
 */
export async function computeStandings(weekIdsFilter?: number[]): Promise<StandingsRow[]> {
  const allUsers = (await storage.listUsers()).filter((u) => !u.isAdmin || true);
  const allWeeks = (await storage.listWeeks()).filter((w) => !weekIdsFilter || weekIdsFilter.includes(w.id));
  const seasonYear = await getCurrentSeasonYear();
  const cristoBallResults = await storage.getCristoBallResults(seasonYear);
  const cristoBallGraded = !!cristoBallResults?.gradedAt;
  const cristoBallEntries = cristoBallGraded ? await storage.listCristoBallEntries(seasonYear) : [];
  const cristoBallByUser = new Map(cristoBallEntries.map((e) => [e.userId, e]));

  const totals = new Map<
    number,
    { name: string; weeklyPoints: Record<number, number>; cristoBallPoints: number | null; total: number }
  >();
  for (const u of allUsers) {
    const cristoBallPoints = cristoBallGraded ? cristoBallByUser.get(u.id)?.pointsEarned ?? 0 : null;
    totals.set(u.id, { name: u.name, weeklyPoints: {}, cristoBallPoints, total: cristoBallPoints ?? 0 });
  }

  for (const week of allWeeks) {
    const weekPicks = await storage.listPicksByWeek(week.id);
    const weekUpsets = await storage.listUpsetPicksByWeek(week.id);
    for (const pick of weekPicks) {
      if (pick.pointsEarned == null) continue;
      const entry = totals.get(pick.userId);
      if (!entry) continue;
      entry.weeklyPoints[week.id] = (entry.weeklyPoints[week.id] ?? 0) + pick.pointsEarned;
      entry.total += pick.pointsEarned;
    }
    for (const up of weekUpsets) {
      const entry = totals.get(up.userId);
      if (!entry) continue;
      entry.weeklyPoints[week.id] = (entry.weeklyPoints[week.id] ?? 0) + up.pointsEarned;
      entry.total += up.pointsEarned;
    }
  }

  const rows: StandingsRow[] = Array.from(totals.entries()).map(([userId, v]) => ({
    userId,
    name: v.name,
    weeklyPoints: v.weeklyPoints,
    cristoBallPoints: v.cristoBallPoints,
    totalPoints: v.total,
    rank: 0,
    previousRank: null,
  }));

  rows.sort((a, b) => b.totalPoints - a.totalPoints);

  // Shared rank on ties (no tiebreaker)
  let currentRank = 0;
  let previousPoints: number | null = null;
  let position = 0;
  for (const row of rows) {
    position += 1;
    if (previousPoints === null || row.totalPoints !== previousPoints) {
      currentRank = position;
      previousPoints = row.totalPoints;
    }
    row.rank = currentRank;
  }

  return rows;
}
