import { type ReactNode } from "react";
import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import StandingsPage from "@/pages/standings";
import GridPage from "@/pages/grid";
import ProfilePage from "@/pages/profile";
import AdminWeeksPage from "@/pages/admin/weeks";
import AdminMembersPage from "@/pages/admin/members";
import AdminWeekDetailPage from "@/pages/admin/week-detail";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading...
    </div>
  );
}

function Protected({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Redirect to="/login" />;
  if (adminOnly && !user.isAdmin) return <Redirect to="/dashboard" />;
  return <AppShell>{children}</AppShell>;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Redirect to="/dashboard" />;
  return <LoginPage />;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={LoginRoute} />
      <Route path="/dashboard">
        <Protected>
          <DashboardPage />
        </Protected>
      </Route>
      <Route path="/standings">
        <Protected>
          <StandingsPage />
        </Protected>
      </Route>
      <Route path="/grid">
        <Protected>
          <GridPage />
        </Protected>
      </Route>
      <Route path="/profile">
        <Protected>
          <ProfilePage />
        </Protected>
      </Route>
      <Route path="/admin/members">
        <Protected adminOnly>
          <AdminNav />
          <AdminMembersPage />
        </Protected>
      </Route>
      <Route path="/admin/weeks/:id">
        <Protected adminOnly>
          <AdminNav />
          <AdminWeekDetailPage />
        </Protected>
      </Route>
      <Route path="/admin">
        <Protected adminOnly>
          <AdminNav />
          <AdminWeeksPage />
        </Protected>
      </Route>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
