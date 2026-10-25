import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <Card className="w-full max-w-sm border-sidebar-border bg-card">
        <CardHeader className="flex flex-col items-center gap-2 pb-2 pt-8">
          <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-center text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="pb-8">{children}</CardContent>
      </Card>
    </div>
  );
}

const backToSignIn = (
  <Link href="/login" className="text-center text-xs text-muted-foreground hover:underline" data-testid="link-back-to-login">
    Back to sign in
  </Link>
);

export function ForgotPasswordPage() {
  const { toast } = useToast();
  const { data: config, isLoading } = useQuery<{ passwordResetEnabled: boolean }>({ queryKey: ["/api/auth/config"] });
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast({ title: "Couldn't send the link", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <AuthCard title="Forgot password" subtitle="Loading…">{null}</AuthCard>;
  }

  if (!config?.passwordResetEnabled) {
    return (
      <AuthCard title="Forgot password" subtitle="Ask your commissioner to reset it. They'll send you a temporary password.">
        <div className="flex flex-col">{backToSignIn}</div>
      </AuthCard>
    );
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle={`If ${email} belongs to a league member, we've sent a link to reset the password. It works for one hour.`}>
        <div className="flex flex-col items-center gap-4" data-testid="text-reset-sent">
          <MailCheck className="h-8 w-8 text-accent" aria-hidden />
          <p className="text-center text-xs text-muted-foreground">Nothing after a few minutes? Check spam, or ask your commissioner.</p>
          {backToSignIn}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot password" subtitle="Enter your email and we'll send you a link to choose a new password.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-reset-email" />
        </div>
        <Button type="submit" disabled={submitting} data-testid="button-send-reset">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
        </Button>
        {backToSignIn}
      </form>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, newPassword: password });
      await refreshUser();
      toast({ title: "Password updated", description: "You're signed in. Other devices were signed out." });
      navigate("/dashboard");
    } catch (err) {
      toast({ title: "Couldn't reset your password", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" subtitle="At least 6 characters.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-new-password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" minLength={6} required value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="input-confirm-password" />
        </div>
        <Button type="submit" disabled={submitting} data-testid="button-reset-password">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save new password"}
        </Button>
        {backToSignIn}
      </form>
    </AuthCard>
  );
}
