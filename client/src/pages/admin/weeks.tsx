import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronRight, Trash2 } from "lucide-react";
import type { Week } from "@shared/schema";

const statusColors: Record<Week["status"], string> = {
  setup: "bg-muted text-muted-foreground",
  open: "bg-primary text-primary-foreground",
  locked: "bg-destructive/15 text-destructive",
  graded: "bg-accent text-accent-foreground",
};

export default function AdminWeeksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ weeks: Week[] }>({ queryKey: ["/api/weeks"] });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ seasonYear: new Date().getFullYear(), weekNumber: 1, label: "", pickDeadline: "", moneyGameCount: 2 });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/weeks", {
        ...form,
        pickDeadline: new Date(form.pickDeadline).toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      setOpen(false);
      setForm({ seasonYear: new Date().getFullYear(), weekNumber: (form.weekNumber ?? 0) + 1, label: "", pickDeadline: "", moneyGameCount: 2 });
      toast({ title: "Week created" });
    },
    onError: (err) => toast({ title: "Couldn't create week", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  const [weekToDelete, setWeekToDelete] = useState<Week | null>(null);
  const [pendingPickCount, setPendingPickCount] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async ({ id, force }: { id: number; force: boolean }) => {
      const res = await apiRequest("DELETE", `/api/admin/weeks/${id}${force ? "?force=true" : ""}`, undefined, {
        allowStatuses: [409],
      });
      if (res.status === 409) {
        const body = await res.json();
        throw Object.assign(new Error(body.message), { pickCount: body.pickCount as number });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      setWeekToDelete(null);
      setPendingPickCount(null);
      toast({ title: "Week deleted" });
    },
    onError: (err: any) => {
      if (typeof err?.pickCount === "number") {
        // Week has submitted picks — show the stronger warning and require a second confirm.
        setPendingPickCount(err.pickCount);
        return;
      }
      toast({ title: "Couldn't delete week", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setWeekToDelete(null);
      setPendingPickCount(null);
    },
  });

  const weeks = data?.weeks ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Weeks</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-new-week">
              <Plus className="h-4 w-4" /> New Week
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new week</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Season year</Label>
                  <Input
                    type="number"
                    value={form.seasonYear}
                    onChange={(e) => setForm((f) => ({ ...f, seasonYear: Number(e.target.value) }))}
                    data-testid="input-season-year"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Week number</Label>
                  <Input
                    type="number"
                    value={form.weekNumber}
                    onChange={(e) => setForm((f) => ({ ...f, weekNumber: Number(e.target.value) }))}
                    data-testid="input-week-number"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Label</Label>
                <Input
                  placeholder="Week 1"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  data-testid="input-week-label"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Pick deadline</Label>
                <Input
                  type="datetime-local"
                  value={form.pickDeadline}
                  onChange={(e) => setForm((f) => ({ ...f, pickDeadline: e.target.value }))}
                  data-testid="input-pick-deadline"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Money games per week</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.moneyGameCount}
                  onChange={(e) => setForm((f) => ({ ...f, moneyGameCount: Number(e.target.value) }))}
                  data-testid="input-money-game-count"
                />
                <p className="text-xs text-muted-foreground">
                  After picks lock, the games with the most even pick split become worth 2 points.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!form.label || !form.pickDeadline || createMutation.isPending}
                data-testid="button-create-week"
              >
                Create Week
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-2">
        {weeks.map((week) => (
          <Card key={week.id} className="hover-elevate" data-testid={`card-week-${week.id}`}>
            <CardContent className="flex items-center justify-between p-4">
              <Link href={`/admin/weeks/${week.id}`} className="flex-1">
                <div className="cursor-pointer">
                  <p className="font-medium">{week.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Locks {new Date(week.pickDeadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <Badge className={statusColors[week.status]}>{week.status}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`button-delete-week-${week.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingPickCount(null);
                    setWeekToDelete(week);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/admin/weeks/${week.id}`}>
                  <ChevronRight className="h-4 w-4 text-muted-foreground cursor-pointer" />
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {weeks.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No weeks yet. Create your first week to get started.
          </p>
        )}
      </div>

      <AlertDialog open={!!weekToDelete} onOpenChange={(isOpen) => { if (!isOpen) { setWeekToDelete(null); setPendingPickCount(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingPickCount != null ? "This week has submitted picks" : `Delete ${weekToDelete?.label}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPickCount != null
                ? `${weekToDelete?.label} has ${pendingPickCount} submitted pick(s). Deleting it will permanently erase those picks along with its games. This can't be undone. Delete anyway?`
                : `This will permanently delete ${weekToDelete?.label} and all of its games. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-week">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-week"
              onClick={() => {
                if (!weekToDelete) return;
                deleteMutation.mutate({ id: weekToDelete.id, force: pendingPickCount != null });
              }}
            >
              {pendingPickCount != null ? "Delete anyway" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
