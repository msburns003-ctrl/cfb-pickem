import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, KeyRound, Trash2 } from "lucide-react";
import type { PublicUser } from "@shared/schema";

export default function AdminMembersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ members: PublicUser[] }>({ queryKey: ["/api/admin/members"] });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(null);

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/members", { name, email });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/members"] });
      setName("");
      setEmail("");
      setOpen(false);
      setCredentials({ email: data.member.email, tempPassword: data.tempPassword });
    },
    onError: (err) => toast({ title: "Couldn't add member", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/members/${id}/reset-password`);
      return res.json();
    },
    onSuccess: (data) => setCredentials({ email: data.member.email, tempPassword: data.tempPassword }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/members/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/members"] }),
  });

  const members = data?.members ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Members ({members.length})</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-member">
              <Plus className="h-4 w-4" /> Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a member</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-member-name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-member-email" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => addMutation.mutate()} disabled={!name || !email || addMutation.isPending} data-testid="button-save-member">
                Add Member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {credentials && (
        <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm" data-testid="text-new-credentials">
          <p className="font-medium">Share these login details:</p>
          <p className="text-muted-foreground">
            Email: <span className="font-mono text-foreground">{credentials.email}</span> · Temp password:{" "}
            <span className="font-mono text-foreground">{credentials.tempPassword}</span>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-card-border bg-card p-3" data-testid={`row-member-${m.id}`}>
            <div>
              <p className="font-medium">
                {m.name} {m.isAdmin && <Badge variant="outline" className="ml-1 text-[10px]">Admin</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => resetMutation.mutate(m.id)} title="Reset password" data-testid={`button-reset-${m.id}`}>
                <KeyRound className="h-4 w-4" />
              </Button>
              {!m.isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Remove ${m.name} from the league?`)) deleteMutation.mutate(m.id);
                  }}
                  title="Remove member"
                  data-testid={`button-delete-${m.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
