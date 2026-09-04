import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Trophy, DollarSign, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEastern, isoToEasternInputValue, easternInputValueToIso } from "@/lib/time";
import type { Game, Week } from "@shared/schema";

interface AdminWeekResponse {
  week: Week;
  games: Game[];
  pickProgress: { userId: number; name: string; picksSubmitted: number; hasUpsetPick: boolean }[];
  ATS_THRESHOLD: number;
  weeklyWinners: { userId: number; name: string; points: number }[];
}

const emptyGameForm = { awayTeam: "", homeTeam: "", favoriteTeam: "", spread: "", kickoff: "", broadcast: "" };

type SubmissionStatus = "none" | "partial" | "complete" | "empty";

function submissionStatus(submitted: number, total: number): SubmissionStatus {
  if (total === 0) return "empty";
  if (submitted === 0) return "none";
  if (submitted < total) return "partial";
  return "complete";
}

const submissionRowStyles: Record<SubmissionStatus, string> = {
  empty: "border-card-border",
  none: "border-red-500/40 bg-red-500/10",
  partial: "border-yellow-500/40 bg-yellow-500/10",
  complete: "border-green-500/40 bg-green-500/10",
};

const submissionTextStyles: Record<SubmissionStatus, string> = {
  empty: "text-muted-foreground",
  none: "text-red-700 dark:text-red-400",
  partial: "text-yellow-700 dark:text-yellow-400",
  complete: "text-green-700 dark:text-green-400",
};

const submissionDotStyles: Record<SubmissionStatus, string> = {
  empty: "bg-muted-foreground/40",
  none: "bg-red-500",
  partial: "bg-yellow-500",
  complete: "bg-green-500",
};

const submissionLegend: { status: SubmissionStatus; label: string }[] = [
  { status: "complete", label: "All picks in" },
  { status: "partial", label: "Partial" },
  { status: "none", label: "Nothing yet" },
];

export default function AdminWeekDetailPage() {
  const params = useParams<{ id: string }>();
  const weekId = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [gameForm, setGameForm] = useState(emptyGameForm);
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, { away: string; home: string }>>({});
  const [payoutDraft, setPayoutDraft] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AdminWeekResponse>({ queryKey: [`/api/admin/weeks/${weekId}`] });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/admin/weeks/${weekId}`] });

  const updateWeekMutation = useMutation({
    mutationFn: (fields: Partial<Week>) => apiRequest("PATCH", `/api/admin/weeks/${weekId}`, fields),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
    },
  });

  const addGameMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/weeks/${weekId}/games/import`, {
        games: [
          {
            ...gameForm,
            spread: Number(gameForm.spread),
            kickoff: easternInputValueToIso(gameForm.kickoff),
            broadcast: gameForm.broadcast || null,
          },
        ],
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setGameForm(emptyGameForm);
      setAddOpen(false);
      toast({ title: "Game added" });
    },
    onError: (err) => toast({ title: "Couldn't add game", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  const toggleSelectedMutation = useMutation({
    mutationFn: ({ id, isSelected }: { id: number; isSelected: boolean }) => apiRequest("PATCH", `/api/admin/games/${id}`, { isSelected }),
    onSuccess: invalidate,
  });

  const deleteGameMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/games/${id}`),
    onSuccess: invalidate,
  });

  const resultMutation = useMutation({
    mutationFn: ({ id, awayScore, homeScore }: { id: number; awayScore: number; homeScore: number }) =>
      apiRequest("POST", `/api/admin/games/${id}/result`, { awayScore, homeScore }),
    onSuccess: invalidate,
    onError: (err) => toast({ title: "Couldn't save score", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  const gradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/weeks/${weekId}/grade`);
      return (await res.json()) as { ok: true; gradedGameIds: number[]; pendingGameIds: number[]; weekFullyGraded: boolean };
    },
    onSuccess: (result) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/standings"] });
      const gradedCount = result.gradedGameIds.length;
      const pendingCount = result.pendingGameIds.length;
      toast({
        title: result.weekFullyGraded ? "Week fully graded" : `Graded ${gradedCount} game${gradedCount === 1 ? "" : "s"}`,
        description: result.weekFullyGraded
          ? "All selected games are final. Standings have been updated."
          : `${pendingCount} game${pendingCount === 1 ? "" : "s"} still in progress — grade again once they finish.`,
      });
    },
    onError: (err) => toast({ title: "Couldn't grade games", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  const checkGamesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/weeks/${weekId}/check-games`);
      return (await res.json()) as { updated: Game[]; stillScheduled: Game[]; unmatched: Game[] };
    },
    onSuccess: (result) => {
      invalidate();
      const parts: string[] = [];
      if (result.updated.length) parts.push(`${result.updated.length} game${result.updated.length === 1 ? "" : "s"} marked final`);
      if (result.stillScheduled.length) parts.push(`${result.stillScheduled.length} still in progress`);
      if (result.unmatched.length) parts.push(`${result.unmatched.length} not found yet — enter manually if needed`);
      toast({
        title: parts.length ? "Games checked" : "Nothing to update",
        description: parts.length ? parts.join(" · ") : "No games have finished yet.",
      });
    },
    onError: (err) => toast({ title: "Couldn't check games", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  if (isLoading || !data) return <p className="text-muted-foreground">Loading...</p>;

  const { week, games, pickProgress, weeklyWinners } = data;
  const payoutAmountValue = payoutDraft ?? (week.payoutAmount != null ? String(week.payoutAmount) : "");
  const selectedGames = games.filter((g) => g.isSelected);
  const candidateGames = games.filter((g) => !g.isSelected);
  const finalSelectedGames = selectedGames.filter((g) => g.status === "final");
  const allSelectedFinal = selectedGames.length > 0 && selectedGames.every((g) => g.status === "final");
  const anySelectedFinal = finalSelectedGames.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link href="/admin" data-testid="link-back-weeks">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="font-display text-lg font-semibold">{week.label}</h2>
        <Badge>{week.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Week settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Pick deadline (Eastern Time)</Label>
            <Input
              type="datetime-local"
              defaultValue={isoToEasternInputValue(week.pickDeadline)}
              onBlur={(e) => e.target.value && updateWeekMutation.mutate({ pickDeadline: easternInputValueToIso(e.target.value) })}
              data-testid="input-edit-deadline"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Money games per week</Label>
            <Input
              type="number"
              min={0}
              defaultValue={week.moneyGameCount}
              onBlur={(e) => updateWeekMutation.mutate({ moneyGameCount: Number(e.target.value) })}
              data-testid="input-edit-money-count"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={week.status} onValueChange={(v) => updateWeekMutation.mutate({ status: v as Week["status"] })}>
              <SelectTrigger data-testid="select-week-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="setup">Setup (hidden from members)</SelectItem>
                <SelectItem value="open">Open (accepting picks)</SelectItem>
                <SelectItem value="locked">Locked (no more picks)</SelectItem>
                <SelectItem value="graded">Graded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end">
            <Button
              onClick={() => gradeMutation.mutate()}
              disabled={!anySelectedFinal || gradeMutation.isPending}
              data-testid="button-grade-week"
            >
              <Trophy className="h-4 w-4" /> Grade Completed Games
            </Button>
            {selectedGames.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {allSelectedFinal
                  ? "All games final — this will finish grading the week."
                  : anySelectedFinal
                    ? `${finalSelectedGames.length}/${selectedGames.length} games final — grading now only scores those.`
                    : "Enter a final score for at least one selected game first."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {weeklyWinners.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent" /> Weekly Payout
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">
              {weeklyWinners.length === 1 ? "Winner: " : "Winners (tied): "}
              <span className="font-medium">{weeklyWinners.map((w) => w.name).join(", ")}</span>
              <span className="text-muted-foreground"> · {weeklyWinners[0].points} pts</span>
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  className="w-32"
                  value={payoutAmountValue}
                  onChange={(e) => setPayoutDraft(e.target.value)}
                  onBlur={(e) => {
                    const amount = e.target.value === "" ? null : Number(e.target.value);
                    updateWeekMutation.mutate({ payoutAmount: amount });
                    setPayoutDraft(null);
                  }}
                  data-testid="input-payout-amount"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={week.payoutPaid}
                  onCheckedChange={(checked) => updateWeekMutation.mutate({ payoutPaid: checked })}
                  data-testid="switch-payout-paid"
                />
                <span className="text-sm text-muted-foreground">{week.payoutPaid ? "Paid" : "Unpaid"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Games ({selectedGames.length} selected · {candidateGames.length} candidates)</CardTitle>
          <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkGamesMutation.mutate()}
            disabled={checkGamesMutation.isPending || games.every((g) => g.status === "final")}
            data-testid="button-check-games"
          >
            <RefreshCw className={cn("h-4 w-4", checkGamesMutation.isPending && "animate-spin")} />
            {checkGamesMutation.isPending ? "Checking..." : "Check Games"}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-add-game">
                <Plus className="h-4 w-4" /> Add Game
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a game</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 col-span-1">
                  <Label>Away team</Label>
                  <Input value={gameForm.awayTeam} onChange={(e) => setGameForm((f) => ({ ...f, awayTeam: e.target.value }))} data-testid="input-away-team" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Home team</Label>
                  <Input value={gameForm.homeTeam} onChange={(e) => setGameForm((f) => ({ ...f, homeTeam: e.target.value }))} data-testid="input-home-team" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Favorite</Label>
                  <Input value={gameForm.favoriteTeam} onChange={(e) => setGameForm((f) => ({ ...f, favoriteTeam: e.target.value }))} data-testid="input-favorite-team" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Spread</Label>
                  <Input type="number" step="0.5" value={gameForm.spread} onChange={(e) => setGameForm((f) => ({ ...f, spread: e.target.value }))} data-testid="input-spread" />
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label>Kickoff (Eastern Time)</Label>
                  <Input type="datetime-local" value={gameForm.kickoff} onChange={(e) => setGameForm((f) => ({ ...f, kickoff: e.target.value }))} data-testid="input-kickoff" />
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label>Broadcast (optional)</Label>
                  <Input value={gameForm.broadcast} onChange={(e) => setGameForm((f) => ({ ...f, broadcast: e.target.value }))} data-testid="input-broadcast" />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addGameMutation.mutate()}
                  disabled={!gameForm.awayTeam || !gameForm.homeTeam || !gameForm.favoriteTeam || !gameForm.spread || !gameForm.kickoff || addGameMutation.isPending}
                  data-testid="button-save-game"
                >
                  Add Game
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {games.length === 0 && <p className="text-sm text-muted-foreground">No games yet. Add candidates to build this week's slate.</p>}
          {games.map((game) => {
            const draft = scoreDrafts[game.id] ?? { away: game.awayScore?.toString() ?? "", home: game.homeScore?.toString() ?? "" };
            return (
              <div key={game.id} className={cn("rounded-lg border p-3", game.isSelected ? "border-primary/30 bg-primary/5" : "border-card-border bg-card")} data-testid={`row-admin-game-${game.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {game.awayTeam} @ {game.homeTeam}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {game.favoriteTeam} -{game.spread} · {game.pickType} ·{" "}
                      {formatEastern(game.kickoff, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {game.broadcast ? ` · ${game.broadcast}` : ""}
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
                    {game.isSelected && game.isMoneyGame && (
                      <Badge className="gap-1 bg-accent text-accent-foreground" data-testid={`badge-admin-money-${game.id}`}>
                        <DollarSign className="h-3 w-3" /> Money game
                      </Badge>
                    )}
                    {game.status === "final" ? (
                      <Badge variant="outline">
                        Final {game.awayScore}-{game.homeScore}
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Input
                          className="h-8 w-20"
                          placeholder="Away"
                          value={draft.away}
                          onChange={(e) => setScoreDrafts((d) => ({ ...d, [game.id]: { ...draft, away: e.target.value } }))}
                          data-testid={`input-away-score-${game.id}`}
                        />
                        <Input
                          className="h-8 w-20"
                          placeholder="Home"
                          value={draft.home}
                          onChange={(e) => setScoreDrafts((d) => ({ ...d, [game.id]: { ...draft, home: e.target.value } }))}
                          data-testid={`input-home-score-${game.id}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={draft.away === "" || draft.home === ""}
                          onClick={() => resultMutation.mutate({ id: game.id, awayScore: Number(draft.away), homeScore: Number(draft.home) })}
                          data-testid={`button-save-score-${game.id}`}
                        >
                          Save
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={game.isSelected}
                        onCheckedChange={(checked) => toggleSelectedMutation.mutate({ id: game.id, isSelected: checked })}
                        data-testid={`switch-selected-${game.id}`}
                      />
                      <span className="text-xs text-muted-foreground">On slate</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteGameMutation.mutate(game.id)} data-testid={`button-delete-game-${game.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 space-y-0">
          <CardTitle className="text-base">Pick progress</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            {submissionLegend.map((item) => (
              <div key={item.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2.5 w-2.5 rounded-full", submissionDotStyles[item.status])} />
                {item.label}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pickProgress.map((p) => {
            const status = submissionStatus(p.picksSubmitted, selectedGames.length);
            return (
              <div
                key={p.userId}
                className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", submissionRowStyles[status])}
                data-testid={`row-progress-${p.userId}`}
              >
                <span>{p.name}</span>
                <span className={cn("text-xs font-medium", submissionTextStyles[status])}>
                  {p.picksSubmitted}/{selectedGames.length}
                  {p.hasUpsetPick ? " +U" : ""}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
