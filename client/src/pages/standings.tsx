import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Week } from "@shared/schema";

interface StandingsRow {
  userId: number;
  name: string;
  weeklyPoints: Record<number, number>;
  totalPoints: number;
  rank: number;
}

interface StandingsResponse {
  rows: StandingsRow[];
  weeks: Week[];
}

function rankBadgeClass(rank: number) {
  if (rank === 1) return "bg-accent text-accent-foreground";
  if (rank === 2) return "bg-secondary text-secondary-foreground";
  if (rank === 3) return "bg-secondary text-secondary-foreground";
  return "bg-transparent";
}

export default function StandingsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<StandingsResponse>({ queryKey: ["/api/standings"] });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        Standings will appear once the first week is graded.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
        <Trophy className="h-5 w-5 text-accent" /> Season Standings
      </h1>
      <div className="overflow-x-auto rounded-lg border border-card-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Member</th>
              {data.weeks.map((w) => (
                <th key={w.id} className="px-3 py-2 text-center font-medium whitespace-nowrap">
                  {w.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.userId}
                className={cn(
                  "border-b border-card-border last:border-0",
                  row.userId === user?.id && "bg-primary/5",
                )}
                data-testid={`row-standings-${row.userId}`}
              >
                <td className="px-3 py-2">
                  <Badge variant="outline" className={cn("min-w-8 justify-center", rankBadgeClass(row.rank))}>
                    {row.rank}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-medium">
                  {row.name}
                  {row.userId === user?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </td>
                {data.weeks.map((w) => (
                  <td key={w.id} className="px-3 py-2 text-center text-muted-foreground">
                    {row.weeklyPoints[w.id] ?? "–"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-display font-semibold">{row.totalPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
