import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CountdownTimer } from "@/components/CountdownTimer";
import { formatEastern } from "@/lib/time";
import { Sparkles, Trophy } from "lucide-react";
import {
  CRISTO_BALL_CATEGORIES,
  CRISTO_BALL_SEASON_QUESTIONS,
  CRISTO_BALL_CHOICE_QUESTIONS,
  CRISTO_BALL_WIN_TOTALS,
  CRISTO_BALL_NATIONAL_CHAMP_POINTS,
  CRISTO_BALL_PLAYOFF_TEAM_COUNT,
  CRISTO_BALL_PLAYOFF_TEAM_POINTS,
  type CristoBallEntry,
} from "@shared/schema";

const SEASON_QUESTION_POINTS = CRISTO_BALL_SEASON_QUESTIONS[0]?.points ?? 5;

function ptsLabel(n: number, each = false): string {
  const unit = n === 1 ? "pt" : "pts";
  return each ? `${n} ${unit} each` : `${n} ${unit}`;
}

interface CristoBallMeResponse {
  seasonYear: number;
  entry: CristoBallEntry | null;
  locked: boolean;
  lockDeadline: string | null;
}

function emptyPlayoffPicks(existing?: string[]): string[] {
  const picks = [...(existing ?? [])];
  while (picks.length < CRISTO_BALL_PLAYOFF_TEAM_COUNT) picks.push("");
  return picks.slice(0, CRISTO_BALL_PLAYOFF_TEAM_COUNT);
}

export default function CristoBallPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<CristoBallMeResponse>({ queryKey: ["/api/cristoball/me"] });

  const [picks, setPicks] = useState<Record<string, string>>({});
  const [seasonAnswers, setSeasonAnswers] = useState<Record<string, boolean | null>>({});
  const [choicePicks, setChoicePicks] = useState<Record<string, string>>({});
  const [winTotalPicks, setWinTotalPicks] = useState<Record<string, "over" | "under">>({});
  const [nationalChampPick, setNationalChampPick] = useState("");
  const [playoffPicks, setPlayoffPicks] = useState<string[]>(emptyPlayoffPicks());
  const [tiebreakerGuess, setTiebreakerGuess] = useState<string>("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data?.entry && !initialized) {
      setPicks(data.entry.picks ?? {});
      setSeasonAnswers(data.entry.seasonAnswers ?? {});
      setChoicePicks(data.entry.choicePicks ?? {});
      setWinTotalPicks(data.entry.winTotalPicks ?? {});
      setNationalChampPick(data.entry.nationalChampPick ?? "");
      setPlayoffPicks(emptyPlayoffPicks(data.entry.playoffPicks));
      setTiebreakerGuess(data.entry.tiebreakerGuess != null ? String(data.entry.tiebreakerGuess) : "");
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cristoball/me", {
        picks,
        seasonAnswers,
        choicePicks,
        winTotalPicks,
        nationalChampPick,
        playoffPicks: playoffPicks.map((p) => p.trim()),
        tiebreakerGuess: tiebreakerGuess.trim() === "" ? null : Number(tiebreakerGuess),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cristoball/me"] });
      toast({ title: "Cristo-Ball picks saved" });
    },
    onError: (err) => {
      toast({ title: "Couldn't save picks", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const { locked, lockDeadline } = data;
  const filledCount =
    CRISTO_BALL_CATEGORIES.filter((c) => !!picks[c.key]).length +
    CRISTO_BALL_SEASON_QUESTIONS.filter((q) => seasonAnswers[q.key] !== undefined && seasonAnswers[q.key] !== null).length +
    CRISTO_BALL_CHOICE_QUESTIONS.filter((q) => !!choicePicks[q.key]).length +
    CRISTO_BALL_WIN_TOTALS.filter((w) => !!winTotalPicks[w.key]).length +
    (nationalChampPick.trim() ? 1 : 0) +
    playoffPicks.filter((p) => p.trim()).length;
  const totalFields =
    CRISTO_BALL_CATEGORIES.length +
    CRISTO_BALL_SEASON_QUESTIONS.length +
    CRISTO_BALL_CHOICE_QUESTIONS.length +
    CRISTO_BALL_WIN_TOTALS.length +
    1 +
    CRISTO_BALL_PLAYOFF_TEAM_COUNT;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" /> Cristo-Ball {data.seasonYear}
          </h1>
          <p className="text-sm text-muted-foreground">
            One-time preseason predictions, worth points at the end of the season · {filledCount}/{totalFields} filled in
          </p>
        </div>
        {!locked && lockDeadline && (
          <div className="text-sm">
            Locks in <CountdownTimer deadline={lockDeadline} />
            <span className="ml-1 text-xs text-muted-foreground">
              ({formatEastern(lockDeadline, { weekday: "short", hour: "numeric", minute: "2-digit" })})
            </span>
          </div>
        )}
      </div>

      {locked && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" data-testid="text-cristoball-locked">
          Cristo-Ball picks are locked for the season. Scoring happens once every category is decided at year's end.
        </p>
      )}

      {data.entry?.pointsEarned != null && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <span className="flex items-center gap-2 font-medium">
              <Trophy className="h-4 w-4 text-accent" /> Your Cristo-Ball score
            </span>
            <Badge className="bg-accent text-accent-foreground text-base px-3 py-1" data-testid="badge-cristoball-score">
              {ptsLabel(data.entry.pointsEarned)}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {CRISTO_BALL_CATEGORIES.map((cat) => (
          <Card key={cat.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{cat.label}</span>
                <Badge variant="outline">{ptsLabel(cat.points)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={picks[cat.key] ?? ""}
                onValueChange={(v) => setPicks((prev) => ({ ...prev, [cat.key]: v }))}
                disabled={locked}
                className="flex flex-col gap-2"
              >
                {cat.options.map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`${cat.key}-${opt}`} data-testid={`radio-${cat.key}-${opt.replace(/\s+/g, "-").toLowerCase()}`} />
                    <Label htmlFor={`${cat.key}-${opt}`} className="text-sm font-normal cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>This season...</span>
            <Badge variant="outline">{ptsLabel(SEASON_QUESTION_POINTS, true)}</Badge>
          </CardTitle>
          <CardDescription>Predict whether each of these will happen this season.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {CRISTO_BALL_SEASON_QUESTIONS.map((q) => (
            <div key={q.key} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{q.label}</span>
              <RadioGroup
                value={seasonAnswers[q.key] === true ? "yes" : seasonAnswers[q.key] === false ? "no" : ""}
                onValueChange={(v) => setSeasonAnswers((prev) => ({ ...prev, [q.key]: v === "yes" }))}
                disabled={locked}
                className="flex gap-4 shrink-0"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="yes" id={`${q.key}-yes`} data-testid={`radio-${q.key}-yes`} />
                  <Label htmlFor={`${q.key}-yes`} className="text-sm font-normal cursor-pointer">
                    Yes
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="no" id={`${q.key}-no`} data-testid={`radio-${q.key}-no`} />
                  <Label htmlFor={`${q.key}-no`} className="text-sm font-normal cursor-pointer">
                    No
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {CRISTO_BALL_CHOICE_QUESTIONS.map((q) => (
          <Card key={q.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{q.label}</span>
                <Badge variant="outline">{ptsLabel(q.points)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={choicePicks[q.key] ?? ""}
                onValueChange={(v) => setChoicePicks((prev) => ({ ...prev, [q.key]: v }))}
                disabled={locked}
                className="flex flex-col gap-2"
              >
                {q.options.map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`${q.key}-${opt}`} data-testid={`radio-${q.key}-${opt.replace(/\s+/g, "-").toLowerCase()}`} />
                    <Label htmlFor={`${q.key}-${opt}`} className="text-sm font-normal cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Win Totals</span>
            <Badge variant="outline">{ptsLabel(CRISTO_BALL_WIN_TOTALS[0]?.points ?? 2, true)}</Badge>
          </CardTitle>
          <CardDescription>Pick Over or Under each team's season win total.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {CRISTO_BALL_WIN_TOTALS.map((w) => (
            <div key={w.key} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">
                {w.team} <span className="text-muted-foreground">{w.line} wins</span>
              </span>
              <RadioGroup
                value={winTotalPicks[w.key] ?? ""}
                onValueChange={(v) => setWinTotalPicks((prev) => ({ ...prev, [w.key]: v as "over" | "under" }))}
                disabled={locked}
                className="flex gap-4 shrink-0"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="over" id={`${w.key}-over`} data-testid={`radio-${w.key}-over`} />
                  <Label htmlFor={`${w.key}-over`} className="text-sm font-normal cursor-pointer">
                    Over
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="under" id={`${w.key}-under`} data-testid={`radio-${w.key}-under`} />
                  <Label htmlFor={`${w.key}-under`} className="text-sm font-normal cursor-pointer">
                    Under
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>2026 National Champion</span>
            <Badge variant="outline">{ptsLabel(CRISTO_BALL_NATIONAL_CHAMP_POINTS)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={nationalChampPick}
            onChange={(e) => setNationalChampPick(e.target.value)}
            disabled={locked}
            placeholder="Team name"
            data-testid="input-national-champ"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>CFP Final Four (predict all {CRISTO_BALL_PLAYOFF_TEAM_COUNT})</span>
            <Badge variant="outline">{ptsLabel(CRISTO_BALL_PLAYOFF_TEAM_POINTS, true)}</Badge>
          </CardTitle>
          <CardDescription>Order doesn't matter — just name the {CRISTO_BALL_PLAYOFF_TEAM_COUNT} teams you think reach the national semifinals.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {playoffPicks.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-sm text-muted-foreground">{i + 1}.</span>
              <Input
                value={val}
                onChange={(e) =>
                  setPlayoffPicks((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
                }
                disabled={locked}
                placeholder="Team name"
                data-testid={`input-playoff-${i + 1}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tiebreaker</CardTitle>
          <CardDescription>Total combined points scored in the UMass @ Akron game on November 18th.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            value={tiebreakerGuess}
            onChange={(e) => setTiebreakerGuess(e.target.value)}
            disabled={locked}
            placeholder="e.g. 54"
            className="max-w-40"
            data-testid="input-tiebreaker"
          />
        </CardContent>
      </Card>

      {!locked && (
        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-cristoball">
            {saveMutation.isPending ? "Saving..." : data.entry ? "Update Picks" : "Save Picks"}
          </Button>
        </div>
      )}
    </div>
  );
}
