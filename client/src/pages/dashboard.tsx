import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { GameCard } from "@/components/GameCard";
import { UpsetPickPanel } from "@/components/UpsetPickPanel";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Game, Pick, UpsetPick, Week } from "@shared/schema";

interface DashboardResponse {
  week: Week;
  games: Game[];
  availableForUpset: Game[];
  myPicks: Pick[];
  myUpsetPick: UpsetPick | null;
  deadlinePassed: boolean;
  locked: boolean;
}

function useWeeksList() {
  return useQuery<{ weeks: Week[] }>({ queryKey: ["/api/weeks"] });
}

export default function DashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: weeksData } = useWeeksList();
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);

  const weeks = weeksData?.weeks ?? [];
  const activeWeekId = selectedWeekId ?? weeks.find((w) => w.status === "open")?.id ?? weeks[0]?.id ?? null;

  const { data, isLoading } = useQuery<DashboardResponse>({
    queryKey: [`/api/weeks/${activeWeekId}/dashboard`],
    enabled: !!activeWeekId,
  });

  const pickMutation = useMutation({
    mutationFn: async ({ gameId, selectedTeam }: { gameId: number; selectedTeam: string }) => {
      const res = await apiRequest("POST", `/api/weeks/${activeWeekId}/picks`, { gameId, selectedTeam });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/weeks/${activeWeekId}/dashboard`] });
    },
    onError: (err) => {
      toast({ title: "Couldn't save pick", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    },
  });

  const upsetMutation = useMutation({
    mutationFn: async (gameId: number) => {
      const res = await apiRequest("POST", `/api/weeks/${activeWeekId}/upset-pick`, { gameId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/weeks/${activeWeekId}/dashboard`] });
      toast({ title: "Underdog pick locked in" });
    },
    onError: (err) => {
      toast({ title: "Couldn't save pick", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    },
  });

  const picksByGame = useMemo(() => {
    const map = new Map<number, Pick>();
    data?.myPicks.forEach((p) => map.set(p.gameId, p));
    return map;
  }, [data]);

  const submittedCount = data?.myPicks.length ?? 0;
  const totalGames = data?.games.length ?? 0;

  if (!weeks.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        No weeks have been set up yet. Check back once your commissioner opens the week.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight" data-testid="text-week-label">
            {data?.week.label ?? "This Week"}
          </h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {submittedCount}/{totalGames} picks submitted
              {data.myUpsetPick ? " · underdog pick in" : " · underdog pick still open"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && !data.locked && (
            <div className="text-sm">
              Locks in <CountdownTimer deadline={data.week.pickDeadline} />
            </div>
          )}
          {weeks.length > 1 && (
            <Select value={String(activeWeekId ?? "")} onValueChange={(v) => setSelectedWeekId(Number(v))}>
              <SelectTrigger className="w-40" data-testid="select-week">
                <SelectValue placeholder="Select week" />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {data.locked && data.week.status === "open" && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Picks are locked for this week. Check back once results are graded.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {data.games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                pick={picksByGame.get(game.id)}
                locked={data.locked}
                submitting={pickMutation.isPending}
                onPick={(team) => pickMutation.mutate({ gameId: game.id, selectedTeam: team })}
              />
            ))}
          </div>

          <UpsetPickPanel
            availableGames={data.availableForUpset}
            myUpsetPick={data.myUpsetPick}
            locked={data.locked}
            submitting={upsetMutation.isPending}
            onSubmit={(gameId) => upsetMutation.mutate(gameId)}
          />
        </>
      )}
    </div>
  );
}
