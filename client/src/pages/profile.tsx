import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";

export default function ProfilePage() {
  const { user, quickAccessLink, refreshUser } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      toast({ title: "Password updated" });
      setCurrentPassword("");
      setNewPassword("");
      refreshUser();
    } catch (err) {
      toast({ title: "Couldn't update password", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!quickAccessLink) return;
    await navigator.clipboard.writeText(quickAccessLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            <span className="text-foreground font-medium">{user?.name}</span> · {user?.email}
          </p>
        </CardContent>
      </Card>

      {quickAccessLink && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick access link</CardTitle>
            <CardDescription>
              Bookmark this link to jump straight to your picks next time, without typing your password.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Input readOnly value={quickAccessLink} className="text-xs" data-testid="input-quick-access-link" />
            <Button variant="outline" size="icon" onClick={copyLink} data-testid="button-copy-link">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4 max-w-sm">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                data-testid="input-current-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="input-new-password"
              />
            </div>
            <Button type="submit" disabled={submitting} className="self-start" data-testid="button-change-password">
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
