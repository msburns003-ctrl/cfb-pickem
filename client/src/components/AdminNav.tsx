import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Weeks", match: (p: string) => p === "/admin" || p.startsWith("/admin/weeks") },
  { href: "/admin/members", label: "Members", match: (p: string) => p.startsWith("/admin/members") },
  { href: "/admin/cristoball", label: "Cristo-Ball", match: (p: string) => p.startsWith("/admin/cristoball") },
];

export function AdminNav() {
  const [location] = useLocation();
  return (
    <div className="mb-4 flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab.match(location) ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          data-testid={`link-admin-tab-${tab.label.toLowerCase()}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
