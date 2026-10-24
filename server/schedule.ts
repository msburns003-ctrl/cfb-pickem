// =============================================================================
// schedule.ts — Imports a week's games (with betting lines) from ESPN, and
// creates the next week automatically once the current one is graded
// =============================================================================

import { storage } from "./storage";
import { computePickType } from "./scoring";
import { dateStrFromDate, fetchEspnScoreboardByDate, findMatchingEvent, FBS_GROUP, type EspnCompetitor, type EspnEvent } from "./scores";
import type { Game, InsertGame, Week } from "@shared/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
// A week's games are those kicking off from 4 days before its pick deadline
// (Tuesday, for a Saturday deadline) to 3 days after (the following Tuesday).
const WINDOW_BEFORE_MS = 4 * DAY_MS;
const WINDOW_AFTER_MS = 3 * DAY_MS;

export interface Candidate {
  sourceFixtureId: string;
  awayTeam: string;
  homeTeam: string;
  awayRank: number | null;
  homeRank: number | null;
  kickoff: string;
  broadcast: string | null;
  // Null when ESPN has no usable betting line yet.
  line: { favoriteTeam: string; spread: number } | null;
}

function teamName(c: EspnCompetitor): string {
  return c.team.location || c.team.shortDisplayName || c.team.displayName || c.team.name || "";
}

function rank(c: EspnCompetitor): number | null {
  const r = c.curatedRank?.current;
  return r != null && r >= 1 && r <= 25 ? r : null;
}

// Favorite and spread from ESPN's odds: the favorite flags plus the spread's
// size, falling back to parsing "ABBR -7.5" / "EVEN" from the details text.
function lineFrom(event: EspnEvent, home: EspnCompetitor, away: EspnCompetitor): Candidate["line"] {
  const odds = event.competitions?.[0]?.odds?.[0];
  if (!odds) return null;

  const details = odds.details?.trim() ?? "";
  if (/^even$/i.test(details) || odds.spread === 0) {
    return { favoriteTeam: teamName(home), spread: 0 };
  }

  const parsed = details.match(/^(\S+)\s+-?(\d+(?:\.\d+)?)$/);
  const size = typeof odds.spread === "number" ? Math.abs(odds.spread) : parsed ? Number(parsed[2]) : NaN;
  if (!Number.isFinite(size)) return null;

  let favorite: EspnCompetitor | null = null;
  if (odds.homeTeamOdds?.favorite) favorite = home;
  else if (odds.awayTeamOdds?.favorite) favorite = away;
  else if (parsed) {
    const abbr = parsed[1].toUpperCase();
    if (home.team.abbreviation?.toUpperCase() === abbr) favorite = home;
    else if (away.team.abbreviation?.toUpperCase() === abbr) favorite = away;
  }
  return favorite ? { favoriteTeam: teamName(favorite), spread: size } : null;
}

function toCandidate(event: EspnEvent): Candidate | null {
  const comp = event.competitions?.[0];
  const home = comp?.competitors.find((c) => c.homeAway === "home");
  const away = comp?.competitors.find((c) => c.homeAway === "away");
  if (!home || !away || !teamName(home) || !teamName(away)) return null;
  const kickoff = new Date(event.date);
  if (Number.isNaN(kickoff.getTime())) return null;
  return {
    sourceFixtureId: event.id,
    awayTeam: teamName(away),
    homeTeam: teamName(home),
    awayRank: rank(away),
    homeRank: rank(home),
    kickoff: kickoff.toISOString(),
    broadcast: comp?.broadcasts?.flatMap((b) => b.names ?? [])[0] ?? null,
    line: lineFrom(event, home, away),
  };
}

/** Every FBS game ESPN lists for the week around this pick deadline. */
export async function fetchWeekCandidates(pickDeadline: string): Promise<{ events: EspnEvent[]; candidates: Candidate[] }> {
  const deadline = new Date(pickDeadline).getTime();
  const start = deadline - WINDOW_BEFORE_MS;
  const end = deadline + WINDOW_AFTER_MS;

  // ESPN files late-night games under the previous day, so start a day early.
  const dates: string[] = [];
  for (let t = start - DAY_MS; t <= end; t += DAY_MS) dates.push(dateStrFromDate(new Date(t)));
  const byDate = await Promise.all(Array.from(new Set(dates)).map((d) => fetchEspnScoreboardByDate(d, FBS_GROUP)));

  const seen = new Set<string>();
  const events: EspnEvent[] = [];
  for (const event of byDate.flat()) {
    const t = new Date(event.date).getTime();
    if (seen.has(event.id) || !(t >= start && t < end)) continue;
    seen.add(event.id);
    events.push(event);
  }
  const candidates = events.map(toCandidate).filter((c): c is Candidate => c !== null);
  return { events, candidates };
}

export interface ImportResult {
  added: number;
  refreshed: number;
  // Existing games whose line wasn't refreshed because picks are already on them.
  lockedByPicks: number;
  noLine: { awayTeam: string; homeTeam: string; kickoff: string }[];
  totalFromEspn: number;
}

/**
 * Adds the week's ESPN games as candidates (not selected) and refreshes lines
 * on games already imported. A game counts as already imported if its ESPN id
 * or its teams match an existing game. Lines are only refreshed on games with
 * no picks or upset picks yet, before kickoff, so nobody's pick changes
 * meaning. Games without a betting line are reported, not added.
 */
export async function importEspnGamesForWeek(weekId: number, prefetched?: Candidate[]): Promise<ImportResult> {
  const week = await storage.getWeek(weekId);
  if (!week) throw new Error("Week not found");

  const candidates = prefetched ?? (await fetchWeekCandidates(week.pickDeadline)).candidates;
  const existing = await storage.listGamesByWeek(weekId);
  const pickedGameIds = new Set([
    ...(await storage.listPicksByWeek(weekId)).map((p) => p.gameId),
    ...(await storage.listUpsetPicksByWeek(weekId)).map((u) => u.gameId),
  ]);

  // The existing game for a candidate, and whether our home/away is flipped vs ESPN's.
  const findExisting = (c: Candidate): { game: Game; swapped: boolean } | undefined => {
    const event = candidateAsEvent(c);
    const byId = existing.find((g) => g.sourceFixtureId === c.sourceFixtureId);
    if (byId) return { game: byId, swapped: findMatchingEvent(byId, [event])?.swapped ?? false };
    for (const game of existing) {
      const match = findMatchingEvent(game, [event]);
      if (match) return { game, swapped: match.swapped };
    }
    return undefined;
  };

  const result: ImportResult = { added: 0, refreshed: 0, lockedByPicks: 0, noLine: [], totalFromEspn: candidates.length };
  const toInsert: InsertGame[] = [];
  const updates: Array<{ id: number } & Partial<Game>> = [];
  let sortOrder = existing.reduce((m, g) => Math.max(m, g.sortOrder), 0);
  const now = Date.now();

  for (const c of candidates) {
    const found = findExisting(c);
    if (found) {
      const { game, swapped } = found;
      if (!c.line || game.status === "final" || new Date(game.kickoff).getTime() <= now) continue;
      if (pickedGameIds.has(game.id)) {
        result.lockedByPicks++;
        continue;
      }
      // Keep our spelling of the teams so existing data still lines up.
      const favoriteIsEspnHome = c.line.favoriteTeam === c.homeTeam;
      const favoriteTeam = favoriteIsEspnHome !== swapped ? game.homeTeam : game.awayTeam;
      const awayRank = swapped ? c.homeRank : c.awayRank;
      const homeRank = swapped ? c.awayRank : c.homeRank;
      const changed =
        game.favoriteTeam !== favoriteTeam ||
        game.spread !== c.line.spread ||
        game.kickoff !== c.kickoff ||
        game.broadcast !== c.broadcast ||
        game.awayRank !== awayRank ||
        game.homeRank !== homeRank;
      if (changed) {
        updates.push({
          id: game.id,
          sourceFixtureId: game.sourceFixtureId ?? c.sourceFixtureId,
          favoriteTeam,
          spread: c.line.spread,
          pickType: computePickType(c.line.spread),
          kickoff: c.kickoff,
          broadcast: c.broadcast,
          awayRank,
          homeRank,
        });
      }
      continue;
    }

    if (!c.line) {
      result.noLine.push({ awayTeam: c.awayTeam, homeTeam: c.homeTeam, kickoff: c.kickoff });
      continue;
    }
    toInsert.push({
      weekId,
      sourceFixtureId: c.sourceFixtureId,
      awayTeam: c.awayTeam,
      homeTeam: c.homeTeam,
      awayRank: c.awayRank,
      homeRank: c.homeRank,
      favoriteTeam: c.line.favoriteTeam,
      spread: c.line.spread,
      kickoff: c.kickoff,
      broadcast: c.broadcast,
      pickType: computePickType(c.line.spread),
      isSelected: false,
      sortOrder: ++sortOrder,
      status: "scheduled",
    });
  }

  // Update one at a time: batch upserts need every row to carry the same keys.
  for (const { id, ...fields } of updates) {
    if (await storage.updateGame(id, fields)) result.refreshed++;
  }
  if (toInsert.length > 0) {
    const created = await storage.createGames(toInsert);
    result.added = created.length;
  }
  return result;
}

// Lets the existing ESPN team-name matcher compare a candidate to our games.
function candidateAsEvent(c: Candidate): EspnEvent {
  const team = (name: string) => ({ location: name, displayName: name });
  return {
    id: c.sourceFixtureId,
    date: c.kickoff,
    competitions: [
      {
        competitors: [
          { homeAway: "home", team: team(c.homeTeam) },
          { homeAway: "away", team: team(c.awayTeam) },
        ],
      },
    ],
  };
}

/** Adds `days` to an instant while keeping its Eastern wall-clock time (DST-safe). */
export function addDaysEastern(iso: string, days: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  // Wall-clock target as if it were UTC, then correct by Eastern's offset at that moment.
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days, Number(parts.hour), Number(parts.minute));
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(t))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t); // second pass settles weeks that cross a DST change
  return new Date(t).toISOString();
}

export interface NextWeekResult {
  week: Week;
  import: ImportResult;
}

/**
 * Once the season's latest week is graded, creates the next one in "setup"
 * (hidden from members until the admin opens it): same pick-deadline weekday
 * and Eastern time one week later, same money game count, and ESPN's games
 * imported as candidates. Does nothing if the next week exists, its deadline
 * has already passed, or ESPN lists no games for it (e.g. the season is over).
 */
export async function ensureNextWeek(now: number): Promise<NextWeekResult | null> {
  const weeks = await storage.listWeeks();
  if (weeks.length === 0) return null;
  const seasonYear = Math.max(...weeks.map((w) => w.seasonYear));
  const season = weeks.filter((w) => w.seasonYear === seasonYear);
  const latest = season.reduce((a, b) => (b.weekNumber > a.weekNumber ? b : a));
  if (latest.status !== "graded") return null;

  const pickDeadline = addDaysEastern(latest.pickDeadline, 7);
  if (new Date(pickDeadline).getTime() <= now) return null;

  const { candidates } = await fetchWeekCandidates(pickDeadline);
  if (candidates.length === 0) return null;

  const weekNumber = latest.weekNumber + 1;
  const week = await storage.createWeek({
    seasonYear,
    weekNumber,
    label: `Week ${weekNumber}`,
    pickDeadline,
    moneyGameCount: latest.moneyGameCount,
    status: "setup",
  });
  const imported = await importEspnGamesForWeek(week.id, candidates);
  return { week, import: imported };
}
