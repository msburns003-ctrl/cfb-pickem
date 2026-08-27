import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      toast({
        title: "Couldn't sign in",
        description: err instanceof Error ? err.message : "Check your email and password and try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <Card className="w-full max-w-sm border-sidebar-border bg-card">
        <CardHeader className="flex flex-col items-center gap-2 pb-2 pt-8">
          <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden>
            <g fill="currentColor" className="text-primary">
              <rect x="-2.3" y="-15.5" width="4.6" height="17" rx="2.3" transform="translate(11,24) rotate(-28)" />
              <rect x="-2.3" y="-15.5" width="4.6" height="17" rx="2.3" transform="translate(21,24) rotate(28)" />
            </g>
            <g fill="currentColor" className="text-accent">
              <circle cx="9" cy="6" r="1.7" />
              <circle cx="14.5" cy="2.6" r="1.1" />
              <circle cx="20" cy="6" r="1.4" />
            </g>
          </svg>
          <h1 className="font-display text-xl font-semibold tracking-tight">College Pick&apos;em</h1>
          <p className="text-center text-sm text-muted-foreground">Sign in to make your weekly picks</p>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="input-email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="input-password"
              />
            </div>
            <Button type="submit" disabled={submitting} className="mt-2" data-testid="button-login">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Don&apos;t have an account? Ask your commissioner to add you.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
