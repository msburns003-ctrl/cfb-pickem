// =============================================================================
// auto-grade.ts — Saves final scores from ESPN and grades weeks automatically
// =============================================================================
//
// Every few minutes, for each active week:
//   1. If a selected game (or a game someone made their upset pick on) has
//      kicked off and isn't final yet, run the same ESPN check as the admin
//      "Check Games" button. It only ever touches games not already final, so
//      scores an admin entered by hand are never overwritten.
//   2. Once the week's picks are locked, run the same grading as the admin
//      "Grade" button whenever a final game's stored result is missing or no
//      longer matches its score (new finals, or a corrected score). Grading
//      waits for the lock because money games are only assigned then.
//
// The manual buttons keep working as an override. Runs in the single
// long-lived server process (see cache.ts); on in production unless
// AUTO_GRADE=off, and off in local dev (which uses the production database)
// unless AUTO_GRADE=on.
// =============================================================================

import { storage } from "./storage";
import { invalidate, prefixes } from "./cache";
import { checkGamesForWeek } from "./scores";
import { gradeCompletedGames, gradeGameOutcome } from "./scoring";
import type { Game, UpsetPick, Week } from "@shared/schema";

const INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;
// Stop checking ESPN for a game this long after kickoff (e.g. postponed games).
const LOOKBACK_MS = 4 * 24 * 60 * 60 * 1000;
// Skip fully graded weeks whose deadline is this far in the past.
const GRADED_WEEK_SKIP_MS = 7 * 24 * 60 * 60 * 1000;

export interface AutoGradeStatus {
  lastRunAt: string;
  savedScores: number;
  graded: boolean;
  error: string | null;
}

const statusByWeek = new Map<number, AutoGradeStatus>();
let running = false;

export function autoGradeEnabled(): boolean {
  const setting = process.env.AUTO_GRADE?.toLowerCase();
  if (setting === "off") return false;
  if (setting === "on") return true;
  return process.env.NODE_ENV === "production";
}

export function getAutoGradeStatus(weekId: number): AutoGradeStatus | null {
  return statusByWeek.get(weekId) ?? null;
}

// True when grading would change something: a final selected game has no
// stored result (or one that no longer matches its score), or an upset pick
// on a final game is still pending.
function needsGrading(games: Game[], upsets: UpsetPick[]): boolean {
  const byId = new Map(games.map((g) => [g.id, g]));
  const finalSelected = games.filter((g) => g.isSelected && g.status === "final" && g.awayScore != null && g.homeScore != null);
  if (finalSelected.length === 0) return false; // grading requires at least one final selected game

  const staleGame = finalSelected.some((g) => {
    const { winner, atsResult } = gradeGameOutcome(g);
    return g.atsResult !== atsResult || (g.winner ?? null) !== winner;
  });
  const pendingUpset = upsets.some((u) => u.result === "pending" && byId.get(u.gameId)?.status === "final");
  return staleGame || pendingUpset;
}

async function processWeek(week: Week, now: number): Promise<void> {
  const games = await storage.listGamesByWeek(week.id);
  const upsets = await storage.listUpsetPicksByWeek(week.id);

  const relevantIds = new Set([...games.filter((g) => g.isSelected).map((g) => g.id), ...upsets.map((u) => u.gameId)]);
  const awaitingScore = games.some((g) => {
    if (!relevantIds.has(g.id) || g.status === "final") return false;
    const kickoff = new Date(g.kickoff).getTime();
    return kickoff <= now && now - kickoff < LOOKBACK_MS;
  });

  let savedScores = 0;
  if (awaitingScore) {
    const result = await checkGamesForWeek(week.id);
    savedScores = result.updated.length;
  }

  const picksLocked = week.status !== "open" || now >= new Date(week.pickDeadline).getTime();
  let graded = false;
  if (picksLocked) {
    // Re-read when scores were just saved so grading sees them.
    const current = savedScores > 0 ? await storage.listGamesByWeek(week.id) : games;
    if (needsGrading(current, upsets)) {
      await gradeCompletedGames(week.id);
      graded = true;
    }
  }

  if (savedScores > 0 || graded) {
    invalidate(prefixes.standings);
    invalidate(prefixes.grid);
    invalidate(prefixes.dashboard);
    console.log(`[auto-grade] week ${week.id}: saved ${savedScores} score(s)${graded ? ", graded" : ""}`);
  }
  if (awaitingScore || graded) {
    statusByWeek.set(week.id, { lastRunAt: new Date(now).toISOString(), savedScores, graded, error: null });
  }
}

export async function runAutoGrade(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const weeks = (await storage.listWeeks()).filter(
      (w) => w.status !== "setup" && !(w.status === "graded" && now - new Date(w.pickDeadline).getTime() > GRADED_WEEK_SKIP_MS),
    );
    for (const week of weeks) {
      try {
        await processWeek(week, now);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[auto-grade] week ${week.id} failed:`, message);
        statusByWeek.set(week.id, { lastRunAt: new Date(now).toISOString(), savedScores: 0, graded: false, error: message });
      }
    }
  } catch (err) {
    console.error("[auto-grade] run failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startAutoGrade(): void {
  if (!autoGradeEnabled()) {
    console.log("[auto-grade] disabled");
    return;
  }
  console.log(`[auto-grade] enabled, every ${INTERVAL_MS / 60000} minutes`);
  setTimeout(() => {
    void runAutoGrade();
    setInterval(() => void runAutoGrade(), INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}
