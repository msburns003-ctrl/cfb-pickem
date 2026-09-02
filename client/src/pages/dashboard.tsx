import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { GameCard } from "@/components/GameCard";
import { UpsetPickPanel } from "@/components/UpsetPickPanel";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatEastern } from "@/lib/time";
import { Sparkles, ArrowRight, Save } from "lucide-react";
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

  // Selecting a team only updates this local map — nothing hits the network
  // until the member presses "Save picks". Keyed by gameId so switching back
  // and forth is free, and only the final choice for each game gets sent.
  const [localPicks, setLocalPicks] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    setLocalPicks(new Map());
  }, [activeWeekId]);

  const batchSaveMutation = useMutation({
    mutationFn: async (picks: { gameId: number; selectedTeam: string }[]) => {
      const res = await apiRequest("POST", `/api/weeks/${activeWeekId}/picks/batch`, { picks });
      return (await res.json()) as {
        saved: { gameId: number; selectedTeam: string }[];
        skipped: { gameId: number; message: string }[];
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/weeks/${activeWeekId}/dashboard`] });
      setLocalPicks((prev) => {
        const next = new Map(prev);
        result.saved.forEach((s) => next.delete(s.gameId));
        return next;
      });
      if (result.skipped.length > 0) {
        const detail = result.skipped
          .map((s) => {
            const game = data?.games.find((g) => g.id === s.gameId);
            return `${game ? `${game.awayTeam} @ ${game.homeTeam}` : `Game ${s.gameId}`}: ${s.message}`;
          })
          .join("; ");
        toast({
          title: `Saved ${result.saved.length}, ${result.skipped.length} couldn't save`,
          description: detail,
          variant: "destructive",
        });
      } else if (result.saved.length > 0) {
        toast({ title: `Saved ${result.saved.length} pick${result.saved.length === 1 ? "" : "s"}` });
      }
    },
    // A network drop can happen after the server already wrote the picks
    // but before the response reaches this device (this is exactly what
    // happened to a member on a flaky mobile connection — 12 of 15 picks
    // saved server-side, yet the client only saw a failed fetch and kept
    // showing all 15 as unsaved). Rather than trust the failure blindly,
    // re-fetch server truth and reconcile before deciding what to tell them.
    onError: async (err, variables) => {
      try {
        const fresh = await queryClient.fetchQuery<DashboardResponse>({
          queryKey: [`/api/weeks/${activeWeekId}/dashboard`],
        });
        const freshByGame = new Map(fresh.myPicks.map((p) => [p.gameId, p.selectedTeam]));
        const actuallySaved = variables.filter((v) => freshByGame.get(v.gameId) === v.selectedTeam);
        const stillUnsaved = variables.filter((v) => freshByGame.get(v.gameId) !== v.selectedTeam);

        if (actuallySaved.length > 0) {
          queryClient.setQueryData([`/api/weeks/${activeWeekId}/dashboard`], fresh);
          setLocalPicks((prev) => {
            const next = new Map(prev);
            actuallySaved.forEach((s) => next.delete(s.gameId));
            return next;
          });
        }

        if (stillUnsaved.length === 0) {
          toast({
            title: `Saved ${actuallySaved.length} pick${actuallySaved.length === 1 ? "" : "s"}`,
            description: "Your connection dropped right after saving, but we double-checked — everything made it through.",
          });
        } else if (actuallySaved.length > 0) {
          toast({
            title: `Saved ${actuallySaved.length}, ${stillUnsaved.length} still need saving`,
            description: "Your connection was unstable partway through. Those picks saved before it dropped — press Save picks again for the rest.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Couldn't save picks",
            description: "We checked and nothing went through. Check your connection and try again.",
            variant: "destructive",
          });
        }
      } catch {
        // The reconciliation check itself failed (e.g. fully offline) — fall
        // back to the plain error rather than silently swallowing it.
        toast({
          title: "Couldn't save picks",
          description: err instanceof Error ? err.message : "Check your connection and try again.",
          variant: "destructive",
        });
      }
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
    // Same reconciliation as the picks batch save: check whether the write
    // actually landed before reporting a scary error.
    onError: async (err, gameId) => {
      try {
        const fresh = await queryClient.fetchQuery<DashboardResponse>({
          queryKey: [`/api/weeks/${activeWeekId}/dashboard`],
        });
        if (fresh.myUpsetPick?.gameId === gameId) {
          queryClient.setQueryData([`/api/weeks/${activeWeekId}/dashboard`], fresh);
          toast({ title: "Underdog pick locked in", description: "Your connection dropped right after saving, but we double-checked — it made it through." });
        } else {
          toast({
            title: "Couldn't save pick",
            description: err instanceof Error ? err.message : "Check your connection and try again.",
            variant: "destructive",
          });
        }
      } catch {
        toast({ title: "Couldn't save pick", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    },
  });

  const picksByGame = useMemo(() => {
    const map = new Map<number, Pick>();
    data?.myPicks.forEach((p) => map.set(p.gameId, p));
    return map;
  }, [data]);

  const unsavedGameIds = useMemo(
    () =>
      Array.from(localPicks.entries())
        .filter(([gameId, team]) => picksByGame.get(gameId)?.selectedTeam !== team)
        .map(([gameId]) => gameId),
    [localPicks, picksByGame],
  );
  const unsavedCount = unsavedGameIds.length;

  useEffect(() => {
    if (unsavedCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsavedCount]);

  const submittedCount = data?.myPicks.length ?? 0;
  const totalGames = data?.games.length ?? 0;

  const handleWeekChange = (weekId: number) => {
    if (unsavedCount > 0 && !window.confirm("You have unsaved picks for this week. Switch weeks and discard them?")) {
      return;
    }
    setSelectedWeekId(weekId);
  };

  const handleSavePicks = () => {
    const picks = unsavedGameIds.map((gameId) => ({ gameId, selectedTeam: localPicks.get(gameId)! }));
    if (picks.length > 0) batchSaveMutation.mutate(picks);
  };

  if (!weeks.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        No weeks have been set up yet. Check back once your commissioner opens the week.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", unsavedCount > 0 && "pb-20")}>
      <Link
        href="/cristoball"
        className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm transition-colors hover:bg-accent/20"
        data-testid="link-cristoball-banner"
      >
        <span className="flex items-center gap-2 font-medium text-accent-foreground">
          <Sparkles className="h-4 w-4 text-accent" />
          Made your season-long Cristo-Ball predictions yet?
        </span>
        <span className="flex items-center gap-1 text-accent shrink-0">
          Go to Cristo-Ball
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight" data-testid="text-week-label">
            {data?.week.label ?? "This Week"}
          </h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {submittedCount}/{totalGames} picks saved
              {unsavedCount > 0 && <span className="font-medium text-accent"> · {unsavedCount} unsaved</span>}
              {data.myUpsetPick ? " · underdog pick in" : " · underdog pick still open"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && !data.locked && (
            <div className="text-sm">
              Locks in <CountdownTimer deadline={data.week.pickDeadline} />
              <span className="ml-1 text-xs text-muted-foreground">
                ({formatEastern(data.week.pickDeadline, { weekday: "short", hour: "numeric", minute: "2-digit" })})
              </span>
            </div>
          )}
          {weeks.length > 1 && (
            <Select value={String(activeWeekId ?? "")} onValueChange={(v) => handleWeekChange(Number(v))}>
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
            {data.games.map((game) => {
              const selectedTeam = localPicks.get(game.id) ?? picksByGame.get(game.id)?.selectedTeam ?? null;
              return (
                <GameCard
                  key={game.id}
                  game={game}
                  pick={picksByGame.get(game.id)}
                  selectedTeam={selectedTeam}
                  unsaved={unsavedGameIds.includes(game.id)}
                  locked={data.locked}
                  onSelect={(team) => setLocalPicks((prev) => new Map(prev).set(game.id, team))}
                />
              );
            })}
          </div>

          {unsavedCount > 0 && (
            <div
              className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-lg border border-card-border bg-card p-3 shadow-lg sm:inset-x-auto sm:right-6 sm:w-96"
              data-testid="bar-save-picks"
            >
              <span className="text-sm font-medium">
                {unsavedCount} pick{unsavedCount === 1 ? "" : "s"} not saved yet
              </span>
              <Button
                onClick={handleSavePicks}
                disabled={batchSaveMutation.isPending}
                data-testid="button-save-picks"
              >
                <Save className="h-4 w-4" />
                {batchSaveMutation.isPending ? "Saving..." : "Save picks"}
              </Button>
            </div>
          )}

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
