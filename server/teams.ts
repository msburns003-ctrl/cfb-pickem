// =============================================================================
// teams.ts — Team logos and abbreviations from ESPN's public teams list
// =============================================================================
//
// Kept in memory and refreshed daily; nothing is stored in the database. Our
// team names (typed by admins or imported from ESPN) are matched with the
// same name matcher used for scores. Clients load the logo images straight
// from ESPN's CDN.

import { normalizeTeamName, teamNamesMatch, type EspnTeam } from "./scores";
import type { TeamInfo } from "@shared/schema";

const ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams";
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000; // after a failed or empty fetch

interface EspnTeamWithLogos extends EspnTeam {
  id?: string;
  logos?: { href?: string; rel?: string[] }[];
}

interface EspnTeamsResponse {
  sports?: { leagues?: { teams?: { team?: EspnTeamWithLogos }[] }[] }[];
}

let teams: EspnTeamWithLogos[] = [];
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

async function fetchTeams(query: string): Promise<EspnTeamWithLogos[]> {
  try {
    const res = await fetch(`${ESPN_TEAMS_URL}?limit=1000${query}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as EspnTeamsResponse;
    return (data.sports ?? []).flatMap((s) => (s.leagues ?? []).flatMap((l) => (l.teams ?? []).map((t) => t.team).filter((t): t is EspnTeamWithLogos => !!t)));
  } catch {
    return [];
  }
}

async function loadTeams() {
  const age = Date.now() - fetchedAt;
  if (teams.length > 0 ? age < REFRESH_MS : age < RETRY_MS) return;
  if (!inflight) {
    inflight = (async () => {
      // FBS explicitly, plus the default list for FCS opponents.
      const lists = await Promise.all([fetchTeams("&groups=80"), fetchTeams("")]);
      const byId = new Map<string, EspnTeamWithLogos>();
      for (const t of lists.flat()) byId.set(t.id ?? t.displayName ?? "", t);
      if (byId.size > 0) teams = Array.from(byId.values());
      fetchedAt = Date.now();
    })().finally(() => {
      inflight = null;
    });
  }
  await inflight;
}

// Only https logo URLs on ESPN's own domains are passed to the browser.
function safeLogo(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && /(^|\.)espncdn\.com$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function infoFor(team: EspnTeamWithLogos): TeamInfo {
  const logos = team.logos ?? [];
  const light = logos.find((l) => l.rel?.includes("default")) ?? logos[0];
  const dark = logos.find((l) => l.rel?.includes("dark"));
  return {
    logo: safeLogo(light?.href),
    logoDark: safeLogo(dark?.href) ?? safeLogo(light?.href),
    abbreviation: (team.abbreviation ?? "").slice(0, 6) || null,
  };
}

/** Logo and abbreviation for each of these team names that matches an ESPN team. */
export async function getTeamInfo(names: string[]): Promise<Record<string, TeamInfo>> {
  await loadTeams();
  const out: Record<string, TeamInfo> = {};
  for (const name of Array.from(new Set(names))) {
    // Exact name matches across every team first; the matcher's looser
    // containment rule could otherwise pair e.g. "Miami" with "Miami (OH)".
    const wanted = normalizeTeamName(name);
    const exact = teams.find((t) =>
      [t.location, t.displayName, t.shortDisplayName, t.abbreviation].some((v) => v && normalizeTeamName(v) === wanted),
    );
    const team = exact ?? teams.find((t) => teamNamesMatch(name, t));
    if (team) out[name] = infoFor(team);
  }
  return out;
}
