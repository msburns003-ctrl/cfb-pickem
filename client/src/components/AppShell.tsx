import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Trophy, ListChecks, ShieldCheck, LogOut, User, LayoutGrid, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-label="College Pick'em logo">
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
  );
}

const navItems = [
  { href: "/dashboard", label: "This Week", icon: ListChecks },
  { href: "/cristoball", label: "Cristo-Ball", icon: Sparkles },
  { href: "/grid", label: "Grid", icon: LayoutGrid },
  { href: "/standings", label: "Standings", icon: Trophy },
];

// Stats pages live under Standings in the navigation.
function isActive(href: string, location: string) {
  return location.startsWith(href) || (href === "/standings" && location.startsWith("/stats"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const items = user?.isAdmin ? [...navItems, { href: "/admin", label: "Admin", icon: ShieldCheck }] : navItems;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Logo />
            <span className="font-display text-base font-semibold tracking-tight">Pick&apos;em</span>
          </Link>
          <nav className="flex items-center gap-1">
            {/* Main links live in the bottom tab bar on phones. */}
            {items.map((item) => {
              const active = isActive(item.href, location);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                location.startsWith("/profile")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
              data-testid="link-nav-profile"
            >
              <User className="h-4 w-4" />
              <span>{user?.name?.split(" ")[0]}</span>
            </Link>
            <ThemeToggle className="text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground" />
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              onClick={() => logout()}
              data-testid="button-logout"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-16">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground sm:hidden"
        aria-label="Main"
        data-testid="nav-bottom"
      >
        <div className="flex">
          {items.map((item) => {
            const active = isActive(item.href, location);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/60",
                )}
                aria-current={active ? "page" : undefined}
                data-testid={`link-bottom-nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <span className={cn("rounded-full px-4 py-1", active && "bg-sidebar-accent")}>
                  <Icon className="h-5 w-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
