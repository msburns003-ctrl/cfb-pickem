import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Bell, Copy, MessageSquare, Share } from "lucide-react";
import { buildLiveUpdate, buildPickReminder } from "@/lib/share-update";
import type { GridResponse } from "@/lib/grid-pdf";
import type { Game, Week } from "@shared/schema";

interface PickProgressRow {
  name: string;
  picksSubmitted: number;
  hasUpsetPick: boolean;
  hiddenFromGrid: boolean;
}

function siteUrl() {
  return `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
}

// Generates a text update for the league group chat. The text is built
// first and shown for review/editing; Share then opens the phone's share
// sheet (Messages → the group) with it, or Copy puts it on the clipboard.
export function ShareUpdateCard({ week, isLocked }: { week: Week; isLocked: boolean }) {
  const { toast } = useToast();
  const [text, setText] = useState("");

  const onError = (err: unknown) =>
    toast({
      title: "Couldn't build the update",
      description: err instanceof Error ? err.message : "Try again in a moment.",
      variant: "destructive",
    });

  const liveMutation = useMutation({
    mutationFn: async () => {
      const [gridRes, standingsRes] = await Promise.all([
        apiRequest("GET", `/api/weeks/${week.id}/grid`),
        apiRequest("GET", "/api/standings"),
      ]);
      const grid = (await gridRes.json()) as GridResponse;
      const standings = (await standingsRes.json()) as { rows: { name: string; totalPoints: number }[] };
      return buildLiveUpdate({
        week: grid.week,
        games: grid.games.filter((g: Game) => g.isSelected),
        grid: grid.grid,
        season: standings.rows,
        siteUrl: siteUrl(),
      });
    },
    onSuccess: setText,
    onError,
  });

  const reminderMutation = useMutation({
    mutationFn: async () => {
      // Fetch fresh so picks made since the page loaded are counted.
      const res = await apiRequest("GET", `/api/admin/weeks/${week.id}`);
      const data = (await res.json()) as { week: Week; games: Game[]; pickProgress: PickProgressRow[] };
      return buildPickReminder({
        week: data.week,
        totalGames: data.games.filter((g) => g.isSelected).length,
        // Booted members (hidden from the grid) don't need reminding.
        progress: data.pickProgress.filter((p) => !p.hiddenFromGrid),
        siteUrl: siteUrl(),
      });
    },
    onSuccess: setText,
    onError,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Paste it into the group text." });
    } catch {
      toast({ title: "Couldn't copy", description: "Select the text and copy it manually.", variant: "destructive" });
    }
  };

  const share = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ text });
    } catch (err) {
      // Closing the share sheet without sending isn't an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      await copy();
    }
  };

  const building = liveMutation.isPending || reminderMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Group text update
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => liveMutation.mutate()}
            disabled={!isLocked || building}
            data-testid="button-build-live-update"
          >
            <MessageSquare className="h-4 w-4" />
            {liveMutation.isPending ? "Building..." : "Standings update"}
          </Button>
          <Button
            variant="outline"
            onClick={() => reminderMutation.mutate()}
            disabled={isLocked || building}
            data-testid="button-build-reminder"
          >
            <Bell className="h-4 w-4" />
            {reminderMutation.isPending ? "Building..." : "Picks reminder"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isLocked
            ? "Top 10 for the week and season. Grade completed games first so the points are current."
            : "Lists who still needs picks. Standings updates unlock once picks lock, so nobody's picks are revealed early."}
        </p>
        {text && (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(24, text.split("\n").length + 1)}
              className="font-mono text-xs"
              data-testid="textarea-share-update"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={share} data-testid="button-share-update">
                <Share className="h-4 w-4" /> Share
              </Button>
              <Button variant="outline" onClick={copy} data-testid="button-copy-update">
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
