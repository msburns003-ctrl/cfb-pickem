import { useQuery } from "@tanstack/react-query";
import type { ConsensusResponse, TeamInfo } from "@shared/schema";

// Logos and abbreviations for the week's teams, keyed by our team name.
// Empty until loaded, or if ESPN's team list is unavailable (names still show).
export function useTeamInfo(weekId: number | null): Record<string, TeamInfo> {
  const { data } = useQuery<{ teams: Record<string, TeamInfo> }>({
    queryKey: [`/api/weeks/${weekId}/teams`],
    enabled: !!weekId,
    staleTime: 10 * 60_000,
  });
  return data?.teams ?? {};
}

// How the league picked each game that has kicked off. Only fetched once a
// game on screen has started; the split can't change after kickoff.
export function useConsensus(weekId: number | null, anyStarted: boolean) {
  const { data } = useQuery<ConsensusResponse>({
    queryKey: [`/api/weeks/${weekId}/consensus`],
    enabled: !!weekId && anyStarted,
  });
  return data?.games ?? {};
}
