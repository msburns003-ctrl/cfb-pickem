import { useQuery } from "@tanstack/react-query";
import type { Game, LiveScoresResponse } from "@shared/schema";

// Matches the server's 60s cache, so polling faster wouldn't show anything new.
const POLL_MS = 60_000;
// Same window the server uses: stop polling for a game this long after kickoff.
const LIVE_WINDOW_MS = 8 * 60 * 60 * 1000;

export function hasGameInProgress(games: Game[], now: number) {
  return games.some((g) => {
    if (g.status === "final") return false;
    const kickoff = new Date(g.kickoff).getTime();
    return kickoff <= now && now - kickoff < LIVE_WINDOW_MS;
  });
}

// Live ESPN scores for a week. Only fetches (and polls every minute) while one
// of the given games is in progress; returns an empty map otherwise.
export function useLiveScores(weekId: number | null, games: Game[], now: number) {
  const active = !!weekId && hasGameInProgress(games, now);
  const { data } = useQuery<LiveScoresResponse>({
    queryKey: [`/api/weeks/${weekId}/live-scores`],
    enabled: active,
    refetchInterval: active ? POLL_MS : false,
    staleTime: POLL_MS,
  });
  return active ? data?.scores ?? {} : {};
}
