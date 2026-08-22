import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutGrid, Lock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Game, Week } from "@shared/schema";

interface GridRow {
  userId: number;
  name: string;
  picks: Record<number, { selectedTeam: string; isCorrect: boolean | null }>;
  upsetPick: {
    underdogTeam: string;
    favoriteTeam: string;
    spread: number;
    result: "pending" | "win" | "loss" | "push";
    pointsEarned: number;
  } | null;
}

interface ConsensusEntry {
  awayCount: number;
  homeCount: number;
  awayPct: number;
  homePct: number;
  totalPicks: number;
}

interface GridResponse {
  week: Week;
  games: Game[];
  grid: GridRow[];
  consensus: Record<number, ConsensusEntry>;
}

function useWeeksList() {
  return useQuery<{ weeks: Week[] }>({ queryKey: ["/api/weeks"] });
}

function shortTeam(name: string) {
  // Trim to last word or two for compact grid cells (e.g. "Ohio State" -> "Ohio St")
  return name.length > 12 ? name.slice(0, 11) + "…" : name;
}

function shortTeamLabel(name: string, rank: number | null) {
  const label = shortTeam(name);
  return rank ? `#${rank} ${label}` : label;
}

export default function GridPage() {
  const { user } = useAuth();
  const { data: weeksData } = useWeeksList();
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);

  const weeks = weeksData?.weeks ?? [];
  const activeWeekId = selectedWeekId ?? weeks.find((w) => w.status !== "setup")?.id ?? weeks[0]?.id ?? null;
  const activeWeek = weeks.find((w) => w.id === activeWeekId) ?? null;

  const { data, isLoading, error } = useQuery<GridResponse>({
    queryKey: [`/api/weeks/${activeWeekId}/grid`],
    enabled: !!activeWeekId,
  });

  if (!weeks.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        No weeks have been set up yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-accent" /> Picks Grid
        </h1>
        <Select value={activeWeekId ? String(activeWeekId) : undefined} onValueChange={(v) => setSelectedWeekId(Number(v))}>
          <SelectTrigger className="w-44" data-testid="select-grid-week">
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
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground" data-testid="text-grid-locked">
          <Lock className="h-5 w-5" />
          <p>{error instanceof Error ? error.message : "The picks grid unlocks once this week's picks are locked."}</p>
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          {data.games.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              No games were selected for this week.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-card-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 font-medium">Member</th>
                    {data.games.map((g) => (
                      <th key={g.id} className="px-3 py-2 text-center font-medium whitespace-nowrap">
                        <div>
                          {shortTeamLabel(g.awayTeam, g.awayRank)} @ {shortTeamLabel(g.homeTeam, g.homeRank)}
                          {g.isMoneyGame && <Badge variant="outline" className="ml-1 text-accent">$</Badge>}
                        </div>
                        <div className="mt-0.5 text-[10px] font-normal text-muted-foreground/80">
                          {g.favoriteTeam === g.awayTeam ? "-" : "+"}
                          {g.spread}
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" /> Upset
                      </span>
                    </th>
                  </tr>
                </thead>
                <tfoot>
                  <tr className="border-b-0 border-t border-card-border bg-muted/30 text-xs" data-testid="row-consensus">
                    <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                      Consensus
                    </td>
                    {data.games.map((g) => {
                      const c = data.consensus[g.id];
                      if (!c || c.totalPicks === 0) {
                        return (
                          <td key={g.id} className="px-3 py-2 text-center text-muted-foreground/50">
                            —
                          </td>
                        );
                      }
                      const awayMajority = c.awayPct >= c.homePct;
                      return (
                        <td key={g.id} className="px-3 py-2 text-center whitespace-nowrap">
                          <div
                            className="flex items-center justify-center gap-1"
                            title={`${g.awayTeam}: ${c.awayCount} pick${c.awayCount === 1 ? "" : "s"} \u00b7 ${g.homeTeam}: ${c.homeCount} pick${c.homeCount === 1 ? "" : "s"}`}
                          >
                            <span className={cn(awayMajority ? "font-semibold text-foreground" : "text-muted-foreground")}>
                              {c.awayPct}%
                            </span>
                            <span className="text-muted-foreground/40">/</span>
                            <span className={cn(!awayMajority ? "font-semibold text-foreground" : "text-muted-foreground")}>
                              {c.homePct}%
                            </span>
                          </div>
                          <div className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-accent/70" style={{ width: `${c.awayPct}%` }} />
                            <div className="h-full bg-secondary" style={{ width: `${c.homePct}%` }} />
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
                <tbody>
                  {data.grid.map((row) => (
                    <tr
                      key={row.userId}
                      className={cn(
                        "border-b border-card-border last:border-0",
                        row.userId === user?.id && "bg-primary/5",
                      )}
                      data-testid={`row-grid-${row.userId}`}
                    >
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium whitespace-nowrap">
                        {row.name}
                        {row.userId === user?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                      </td>
                      {data.games.map((g) => {
                        const pick = row.picks[g.id];
                        return (
                          <td
                            key={g.id}
                            className={cn(
                              "px-3 py-2 text-center whitespace-nowrap",
                              pick?.isCorrect === true && "text-green-600 dark:text-green-400 font-medium",
                              pick?.isCorrect === false && "text-destructive/80",
                            )}
                          >
                            {pick ? shortTeam(pick.selectedTeam) : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center whitespace-nowrap text-muted-foreground">
                        {row.upsetPick ? shortTeam(row.upsetPick.underdogTeam) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
