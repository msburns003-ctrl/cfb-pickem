import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { MemberSeasonStats, PickRecord, SeasonStatsResponse } from "@shared/schema";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function rankLabel(member: MemberSeasonStats, all: MemberSeasonStats[]) {
  const tied = all.filter((m) => m.rank === member.rank).length > 1;
  return `${tied ? "T-" : ""}${ordinal(member.rank)}`;
}

function recordText(r: PickRecord) {
  return r.pushes > 0 ? `${r.wins}–${r.losses}–${r.pushes}` : `${r.wins}–${r.losses}`;
}

// Win rate excluding pushes, or null with nothing decided yet.
function winPct(r: PickRecord) {
  const decided = r.wins + r.losses;
  return decided > 0 ? Math.round((r.wins / decided) * 100) : null;
}

function StatTile({ label, value, detail, testId }: { label: string; value: string; detail?: string; testId: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-3" data-testid={testId}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function RecordTile({ label, record, testId }: { label: string; record: PickRecord; testId: string }) {
  const pct = winPct(record);
  return <StatTile label={label} value={recordText(record)} detail={pct == null ? "No graded picks" : `${pct}% correct`} testId={testId} />;
}

// One bar per graded week (this member's points), with the league average as
// a dashed reference mark. Hover or focus a bar for the details.
function WeeklyPointsChart({ member, data }: { member: MemberSeasonStats; data: SeasonStatsResponse }) {
  const [active, setActive] = useState<number | null>(null);
  const memberCount = data.members.length;
  const max = Math.max(1, ...member.weeks.map((w) => w.points), ...data.weeks.map((w) => w.leagueAverage));
  const height = 160;

  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid="chart-weekly-points">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Points by week</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden /> League average
        </span>
      </div>
      <div className="relative flex items-end gap-0.5" style={{ height }} role="list" aria-label="Points by week">
        {member.weeks.map((w, i) => {
          const week = data.weeks.find((x) => x.id === w.weekId)!;
          const barH = (w.points / max) * height;
          const avgH = (week.leagueAverage / max) * height;
          return (
            <div
              key={w.weekId}
              role="listitem"
              tabIndex={0}
              className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${week.label}: ${w.points} points, ${ordinal(w.weekRank)} that week, league average ${week.leagueAverage}`}
            >
              <div
                className={cn("w-full max-w-10 rounded-t bg-accent transition-opacity", active !== null && active !== i && "opacity-50")}
                style={{ height: Math.max(barH, w.points > 0 ? 4 : 0) }}
              />
              <div
                className="pointer-events-none absolute w-full max-w-12 border-t-2 border-dashed border-muted-foreground"
                style={{ bottom: avgH }}
                aria-hidden
              />
              {active === i && (
                <div
                  className={cn(
                    "pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-md border border-card-border bg-popover px-2.5 py-1.5 text-xs shadow-md",
                    i < member.weeks.length / 2 ? "left-0" : "right-0",
                  )}
                >
                  <div className="font-semibold">{week.label}</div>
                  <div>
                    {w.points} pts · {ordinal(w.weekRank)} of {memberCount} that week
                  </div>
                  <div className="text-muted-foreground">League average {week.leagueAverage}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5 border-t border-card-border pt-1">
        {member.weeks.map((w) => (
          <div key={w.weekId} className="flex-1 text-center text-[10px] text-muted-foreground">
            {data.weeks.find((x) => x.id === w.weekId)?.weekNumber}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekTable({ member, data }: { member: MemberSeasonStats; data: SeasonStatsResponse }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-card-border">
      <table className="w-full text-sm" data-testid="table-week-stats">
        <thead>
          <tr className="border-b border-card-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Week</th>
            <th className="px-3 py-2 text-right font-medium">Pts</th>
            <th className="px-3 py-2 text-right font-medium">Avg</th>
            <th className="px-3 py-2 text-right font-medium">Week rank</th>
            <th className="px-3 py-2 text-right font-medium">Season rank</th>
          </tr>
        </thead>
        <tbody>
          {member.weeks.map((w, i) => {
            const week = data.weeks.find((x) => x.id === w.weekId)!;
            const prev = member.weeks[i - 1]?.seasonRank;
            const moved = prev == null ? 0 : prev - w.seasonRank;
            return (
              <tr key={w.weekId} className="border-b border-card-border last:border-0">
                <td className="px-3 py-2">{week.label}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{w.points}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{week.leagueAverage}</td>
                <td className="px-3 py-2 text-right tabular-nums">{ordinal(w.weekRank)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    {moved > 0 && <ArrowUp className="h-3 w-3 text-green-600 dark:text-green-400" aria-label={`up ${moved}`} />}
                    {moved < 0 && <ArrowDown className="h-3 w-3 text-destructive" aria-label={`down ${-moved}`} />}
                    {ordinal(w.seasonRank)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsPage() {
  const { user } = useAuth();
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<SeasonStatsResponse>({ queryKey: ["/api/stats"] });

  const memberId = params.id ? Number(params.id) : user?.id;

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const member = data.members.find((m) => m.userId === memberId);
  const membersByName = [...data.members].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <BarChart3 className="h-5 w-5 text-accent" /> Season Stats
        </h1>
        <Select value={memberId ? String(memberId) : undefined} onValueChange={(v) => navigate(`/stats/${v}`)}>
          <SelectTrigger className="w-48" data-testid="select-stats-member">
            <SelectValue placeholder="Select member" />
          </SelectTrigger>
          <SelectContent>
            {membersByName.map((m) => (
              <SelectItem key={m.userId} value={String(m.userId)}>
                {m.name}
                {m.userId === user?.id ? " (you)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!member ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">Member not found.</div>
      ) : member.weeks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          Stats will appear once the first week is graded.
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-stats-name">
              {member.name}
              {member.userId === user?.id && <span className="ml-1.5 text-sm font-normal text-muted-foreground">(you)</span>}
            </h2>
            <p className="text-sm text-muted-foreground">
              {rankLabel(member, data.members)} of {data.members.length} · {member.totalPoints} pts
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RecordTile label="All picks" record={member.overall} testId="tile-overall" />
            <RecordTile label="Against the spread" record={member.ats} testId="tile-ats" />
            <RecordTile label="Straight up" record={member.su} testId="tile-su" />
            <RecordTile label="Money games" record={member.money} testId="tile-money" />
            <StatTile
              label="Upset picks"
              value={recordText(member.upsets)}
              detail={`${member.upsets.points} bonus pts`}
              testId="tile-upsets"
            />
            <StatTile
              label="Weekly wins"
              value={String(member.weeklyWins)}
              detail={member.weeklyPushes > 0 ? `+${member.weeklyPushes} tied for top (push)` : "Top score of the week"}
              testId="tile-weekly-wins"
            />
            <StatTile
              label="Best week"
              value={member.bestWeek ? `${member.bestWeek.points} pts` : "–"}
              detail={member.bestWeek ? data.weeks.find((w) => w.id === member.bestWeek!.weekId)?.label : undefined}
              testId="tile-best-week"
            />
            <StatTile
              label="Longest streak"
              value={`${member.longestStreak} correct`}
              detail={
                member.currentStreak > 0
                  ? `Now: ${member.currentStreak} right in a row`
                  : member.currentStreak < 0
                    ? `Now: ${-member.currentStreak} missed in a row`
                    : undefined
              }
              testId="tile-streak"
            />
          </div>

          <WeeklyPointsChart member={member} data={data} />
          <WeekTable member={member} data={data} />
          <p className="text-xs text-muted-foreground">
            Records count graded picks; pushes are picks on games that landed exactly on the spread. Streaks skip pushes.
            Weekly points include upset picks but not Cristo-Ball.
          </p>
        </>
      )}
    </div>
  );
}
