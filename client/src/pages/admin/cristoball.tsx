import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatEastern, isoToEasternInputValue, easternInputValueToIso } from "@/lib/time";
import {
  CRISTO_BALL_CATEGORIES,
  CRISTO_BALL_SEASON_QUESTIONS,
  CRISTO_BALL_CHOICE_QUESTIONS,
  CRISTO_BALL_WIN_TOTALS,
  CRISTO_BALL_PLAYOFF_TEAM_COUNT,
  CRISTO_BALL_HEISMAN_POINTS,
  type CristoBallEntry,
  type CristoBallResults,
} from "@shared/schema";

interface AdminCristoBallResponse {
  seasonYear: number;
  entries: (CristoBallEntry & { userName: string })[];
  results: CristoBallResults | null;
  members: { id: number; name: string }[];
  memberCount: number;
  submittedCount: number;
  locked: boolean;
  lockDeadline: string | null;
}

function emptyPlayoffTeams(existing?: string[]): string[] {
  const teams = [...(existing ?? [])];
  while (teams.length < CRISTO_BALL_PLAYOFF_TEAM_COUNT) teams.push("");
  return teams.slice(0, CRISTO_BALL_PLAYOFF_TEAM_COUNT);
}

export default function AdminCristoBallPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AdminCristoBallResponse>({ queryKey: ["/api/admin/cristoball"] });

  const [actualPicks, setActualPicks] = useState<Record<string, string>>({});
  const [actualSeasonAnswers, setActualSeasonAnswers] = useState<Record<string, boolean | null>>({});
  const [actualChoicePicks, setActualChoicePicks] = useState<Record<string, string>>({});
  const [actualWinTotals, setActualWinTotals] = useState<Record<string, string>>({});
  const [actualNationalChamp, setActualNationalChamp] = useState("");
  const [actualPlayoffTeams, setActualPlayoffTeams] = useState<string[]>(emptyPlayoffTeams());
  const [actualHeisman, setActualHeisman] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data?.results && !initialized) {
      setActualPicks(data.results.actualPicks ?? {});
      setActualSeasonAnswers(data.results.actualSeasonAnswers ?? {});
      setActualChoicePicks(data.results.actualChoicePicks ?? {});
      const winTotals = data.results.actualWinTotals ?? {};
      setActualWinTotals(
        Object.fromEntries(Object.entries(winTotals).map(([k, v]) => [k, v != null ? String(v) : ""])),
      );
      setActualNationalChamp(data.results.actualNationalChamp ?? "");
      setActualPlayoffTeams(emptyPlayoffTeams(data.results.actualPlayoffTeams));
      setActualHeisman(data.results.actualHeisman ?? "");
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveResultsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/cristoball/results", {
        actualPicks,
        actualSeasonAnswers,
        actualChoicePicks,
        actualWinTotals: Object.fromEntries(
          Object.entries(actualWinTotals)
            .filter(([, v]) => v.trim() !== "")
            .map(([k, v]) => [k, Number(v)]),
        ),
        actualNationalChamp,
        actualPlayoffTeams: actualPlayoffTeams.map((t) => t.trim()),
        actualHeisman,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cristoball"] });
      toast({ title: "Actual results saved" });
    },
    onError: (err) => toast({ title: "Couldn't save results", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  const saveLockDeadlineMutation = useMutation({
    mutationFn: async (lockDeadline: string | null) => {
      const res = await apiRequest("PUT", "/api/admin/cristoball/lock-deadline", { lockDeadline });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cristoball"] });
      toast({ title: "Cristo-Ball lock deadline updated" });
    },
    onError: (err) => toast({ title: "Couldn't update lock deadline", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  const gradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/cristoball/grade");
      return res.json();
    },
    onSuccess: (body) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cristoball"] });
      queryClient.invalidateQueries({ queryKey: ["/api/standings"] });
      toast({ title: `Graded ${body.gradedCount} Cristo-Ball entries` });
    },
    onError: (err) => toast({ title: "Couldn't grade Cristo-Ball", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const graded = !!data.results?.gradedAt;
  const submittedUserIds = new Set(data.entries.map((e) => e.userId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Cristo-Ball {data.seasonYear}</h1>
          <p className="text-sm text-muted-foreground">
            {data.submittedCount}/{data.memberCount} members submitted picks
            {graded ? " · graded" : ""}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button data-testid="button-grade-cristoball">{graded ? "Re-grade Cristo-Ball" : "Grade Cristo-Ball"}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{graded ? "Re-grade Cristo-Ball?" : "Grade Cristo-Ball?"}</AlertDialogTitle>
              <AlertDialogDescription>
                This computes every member's Cristo-Ball score from the actual results below and adds it into the season
                standings total. Save the actual results first if you haven't yet.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => gradeMutation.mutate()} data-testid="button-confirm-grade">
                Grade Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submission progress</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.members.map((m) => {
            const entry = data.entries.find((e) => e.userId === m.id);
            return (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-card-border px-3 py-2 text-sm" data-testid={`row-cristoball-progress-${m.id}`}>
                <span>{m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {entry
                    ? entry.pointsEarned != null
                      ? `${entry.pointsEarned} ${entry.pointsEarned === 1 ? "pt" : "pts"}`
                      : "Submitted"
                    : "Not yet"}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entry lock deadline</CardTitle>
          <CardDescription>
            Controls when Cristo-Ball picks lock, independent of any week's pick deadline. Leave blank to fall back to
            Week 1's deadline.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label>Lock deadline (Eastern Time)</Label>
            <Input
              type="datetime-local"
              defaultValue={data.lockDeadline ? isoToEasternInputValue(data.lockDeadline) : ""}
              onBlur={(e) => e.target.value && saveLockDeadlineMutation.mutate(easternInputValueToIso(e.target.value))}
              data-testid="input-cristoball-lock-deadline"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground" data-testid="text-cristoball-lock-status">
              {data.locked ? "Locked" : "Open"}
              {data.lockDeadline
                ? ` \u00b7 ${data.locked ? "locked" : "locks"} ${formatEastern(data.lockDeadline, { dateStyle: "medium", timeStyle: "short" })}`
                : " \u00b7 no deadline set, following Week 1's deadline"}
            </span>
            {data.lockDeadline && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveLockDeadlineMutation.mutate(null)}
                disabled={saveLockDeadlineMutation.isPending}
                data-testid="button-clear-cristoball-lock-deadline"
              >
                Clear (use Week 1's deadline)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual conference champions</CardTitle>
          <CardDescription>Enter the real champion for each conference as it's decided.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {CRISTO_BALL_CATEGORIES.map((cat) => (
            <div key={cat.key} className="flex flex-col gap-1.5">
              <Label>{cat.label}</Label>
              <Select
                value={actualPicks[cat.key] ?? ""}
                onValueChange={(v) => setActualPicks((prev) => ({ ...prev, [cat.key]: v }))}
              >
                <SelectTrigger data-testid={`select-actual-${cat.key}`}>
                  <SelectValue placeholder="Not decided yet" />
                </SelectTrigger>
                <SelectContent>
                  {cat.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual season outcomes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {CRISTO_BALL_SEASON_QUESTIONS.map((q) => (
            <div key={q.key} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{q.label}</span>
              <RadioGroup
                value={actualSeasonAnswers[q.key] === true ? "yes" : actualSeasonAnswers[q.key] === false ? "no" : ""}
                onValueChange={(v) => setActualSeasonAnswers((prev) => ({ ...prev, [q.key]: v === "yes" }))}
                className="flex gap-4 shrink-0"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="yes" id={`actual-${q.key}-yes`} data-testid={`radio-actual-${q.key}-yes`} />
                  <Label htmlFor={`actual-${q.key}-yes`} className="text-sm font-normal cursor-pointer">
                    Yes
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="no" id={`actual-${q.key}-no`} data-testid={`radio-actual-${q.key}-no`} />
                  <Label htmlFor={`actual-${q.key}-no`} className="text-sm font-normal cursor-pointer">
                    No
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual choice-question results</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {CRISTO_BALL_CHOICE_QUESTIONS.map((q) => (
            <div key={q.key} className="flex flex-col gap-1.5">
              <Label>{q.label}</Label>
              <Select
                value={actualChoicePicks[q.key] ?? ""}
                onValueChange={(v) => setActualChoicePicks((prev) => ({ ...prev, [q.key]: v }))}
              >
                <SelectTrigger data-testid={`select-actual-${q.key}`}>
                  <SelectValue placeholder="Not decided yet" />
                </SelectTrigger>
                <SelectContent>
                  {q.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual win totals</CardTitle>
          <CardDescription>Enter each team's final regular-season win count once known.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {CRISTO_BALL_WIN_TOTALS.map((w) => (
            <div key={w.key} className="flex flex-col gap-1.5">
              <Label>
                {w.team} <span className="text-muted-foreground">(line {w.line})</span>
              </Label>
              <Input
                type="number"
                value={actualWinTotals[w.key] ?? ""}
                onChange={(e) => setActualWinTotals((prev) => ({ ...prev, [w.key]: e.target.value }))}
                placeholder="e.g. 9"
                className="max-w-32"
                data-testid={`input-actual-wintotal-${w.key}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual national champion</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={actualNationalChamp}
            onChange={(e) => setActualNationalChamp(e.target.value)}
            placeholder="Team name"
            data-testid="input-actual-national-champ"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual CFP Final Four</CardTitle>
          <CardDescription>Enter all {CRISTO_BALL_PLAYOFF_TEAM_COUNT} teams that reached the national semifinals. Order doesn't matter.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {actualPlayoffTeams.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-sm text-muted-foreground">{i + 1}.</span>
              <Input
                value={val}
                onChange={(e) => setActualPlayoffTeams((prev) => prev.map((t, idx) => (idx === i ? e.target.value : t)))}
                placeholder="Team name"
                data-testid={`input-actual-playoff-${i + 1}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual Heisman Trophy winner</CardTitle>
          <CardDescription>Worth {CRISTO_BALL_HEISMAN_POINTS} {(Number(CRISTO_BALL_HEISMAN_POINTS) === 1 ? "pt" : "pts")}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={actualHeisman}
            onChange={(e) => setActualHeisman(e.target.value)}
            placeholder="Player name"
            data-testid="input-actual-heisman"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveResultsMutation.mutate()} disabled={saveResultsMutation.isPending} data-testid="button-save-actual-results">
          {saveResultsMutation.isPending ? "Saving..." : "Save Actual Results"}
        </Button>
      </div>
    </div>
  );
}
