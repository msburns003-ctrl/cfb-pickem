import type { Game } from "@shared/schema";
import { storage } from "./storage";

// ---------- ESPN public scoreboard types (subset of fields we use) ----------
interface EspnTeam {
  location?: string;
  name?: string;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team: EspnTeam;
}

interface EspnEvent {
  id: string;
  date: string;
  status?: { type?: { completed?: boolean; state?: string; name?: string } };
  competitions?: { competitors: EspnCompetitor[] }[];
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

function dateStrFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * ESPN's scoreboard "dates" bucket groups games by their nominal US game day,
 * not by pure UTC calendar date - a West Coast/Hawaii kickoff at ~2am UTC (late
 * Saturday night local) is filed under the previous UTC calendar date. Return
 * both the kickoff's own UTC date and the UTC date 12 hours earlier so we query
 * whichever bucket ESPN actually used, regardless of what other games are in
 * the same batch.
 */
function espnDateCandidates(iso: string): string[] {
  const kickoff = new Date(iso);
  const primary = dateStrFromDate(kickoff);
  const shifted = dateStrFromDate(new Date(kickoff.getTime() - 12 * 60 * 60 * 1000));
  return primary === shifted ? [primary] : [primary, shifted];
}

async function fetchEspnScoreboardByDate(dateStr: string): Promise<EspnEvent[]> {
  const url = `${ESPN_SCOREBOARD_URL}?dates=${dateStr}&limit=500`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as EspnScoreboardResponse;
    return data.events ?? [];
  } catch {
    return [];
  }
}

// Common cases where the name our admins type doesn't match how ESPN labels the
// team (abbreviations, "State" shorthand, hyphenation, etc). Keys and values are
// both run through the same normalization, so keep entries lowercase & simple.
const TEAM_ALIASES: Record<string, string> = {
  "nc state": "north carolina state",
  "app state": "appalachian state",
  "se louisiana": "southeastern louisiana",
  "sela": "southeastern louisiana",
  "uconn": "connecticut",
  "ul monroe": "louisiana monroe",
  "ull": "louisiana",
  "ul lafayette": "louisiana",
  "utsa": "texas san antonio",
  "smu": "southern methodist",
  "usf": "south florida",
  "fiu": "florida international",
  "unlv": "nevada las vegas",
  "vmi": "virginia military institute",
  "byu": "brigham young",
  "ecu": "east carolina",
  "fau": "florida atlantic",
  "utep": "texas el paso",
  "umass": "massachusetts",
  "pitt": "pittsburgh",
  "ole miss": "mississippi",
  "cal": "california",
};

function normalizeTeamName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/-/g, " ") // hyphens become spaces so "Bethune-Cookman" == "Bethune Cookman"
    .replace(/['’ʻ]/g, "") // apostrophes/okina removed (not spaced) so "Hawai'i" == "Hawaii"
    .replace(/[^a-z0-9\s]/g, "") // drop remaining punctuation (&, periods, parens, etc.)
    .replace(/\s+/g, " ")
    .trim();
  return TEAM_ALIASES[base] ?? base;
}

function teamNamesMatch(ours: string, team: EspnTeam): boolean {
  const a = normalizeTeamName(ours);
  if (!a) return false;

  const exactCandidates = [team.location, team.name, team.displayName, team.shortDisplayName, team.abbreviation]
    .filter((v): v is string => Boolean(v))
    .map(normalizeTeamName);
  if (exactCandidates.includes(a)) return true;

  // Fuzzy containment, restricted to longer strings to avoid short-abbreviation false positives
  // (e.g. an "ND" abbreviation should never fuzzy-match a team name that merely contains "nd").
  const fuzzyCandidates = [team.location, team.displayName].filter((v): v is string => Boolean(v)).map(normalizeTeamName);
  return fuzzyCandidates.some((c) => c.length >= 4 && a.length >= 4 && (c.includes(a) || a.includes(c)));
}

interface MatchedEvent {
  event: EspnEvent;
  /** true if our homeTeam/awayTeam are flipped relative to ESPN's home/away for this event */
  swapped: boolean;
}

function findMatchingEvent(game: Game, events: EspnEvent[]): MatchedEvent | undefined {
  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    if (teamNamesMatch(game.homeTeam, home.team) && teamNamesMatch(game.awayTeam, away.team)) {
      return { event, swapped: false };
    }
    // Tolerate a home/away flip between our data and ESPN's (rare, but seen on
    // occasional neutral-site or corrected-venue games).
    if (teamNamesMatch(game.homeTeam, away.team) && teamNamesMatch(game.awayTeam, home.team)) {
      return { event, swapped: true };
    }
  }
  return undefined;
}

export interface CheckGamesResult {
  updated: Game[];
  stillScheduled: Game[];
  unmatched: Game[];
}

/**
 * Checks every not-yet-final game in a week against ESPN's free public college
 * football scoreboard feed. Any game ESPN reports as final gets its score saved
 * and is marked final here (grading into standings still requires the separate
 * "Grade Week" step). Games ESPN hasn't finished yet, or can't be confidently
 * matched by team name, are left untouched for manual entry/review.
 */
export async function checkGamesForWeek(weekId: number): Promise<CheckGamesResult> {
  const games = await storage.listGamesByWeek(weekId);
  const pending = games.filter((g) => g.status !== "final");

  if (pending.length === 0) {
    return { updated: [], stillScheduled: [], unmatched: [] };
  }

  const uniqueDates = Array.from(new Set(pending.flatMap((g) => espnDateCandidates(g.kickoff))));
  const eventsByDate = await Promise.all(uniqueDates.map((d) => fetchEspnScoreboardByDate(d)));
  const allEvents = eventsByDate.flat();

  const updated: Game[] = [];
  const stillScheduled: Game[] = [];
  const unmatched: Game[] = [];

  for (const game of pending) {
    const match = findMatchingEvent(game, allEvents);
    if (!match) {
      unmatched.push(game);
      continue;
    }

    const completed = match.event.status?.type?.completed === true;
    if (!completed) {
      stillScheduled.push(game);
      continue;
    }

    const comp = match.event.competitions?.[0];
    const homeComp = comp?.competitors.find((c) => c.homeAway === "home");
    const awayComp = comp?.competitors.find((c) => c.homeAway === "away");

    // If our home/away is flipped relative to ESPN's, swap which competitor's
    // score maps to our homeScore/awayScore fields.
    const ourHomeComp = match.swapped ? awayComp : homeComp;
    const ourAwayComp = match.swapped ? homeComp : awayComp;

    const homeScore = ourHomeComp?.score != null ? Number(ourHomeComp.score) : NaN;
    const awayScore = ourAwayComp?.score != null ? Number(ourAwayComp.score) : NaN;

    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
      unmatched.push(game);
      continue;
    }

    const result = await storage.updateGame(game.id, { awayScore, homeScore, status: "final" });
    if (result) updated.push(result);
    else unmatched.push(game);
  }

  return { updated, stillScheduled, unmatched };
}
