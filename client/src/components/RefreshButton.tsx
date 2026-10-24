import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { refreshData } from "@/lib/app-refresh";
import { isRunningAsApp } from "@/lib/install";

// Shown only in the home-screen app, which has no browser reload or
// pull-to-refresh. Refetches the data on screen without reloading the page,
// so unsaved picks are kept.
export function RefreshButton({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  if (!isRunningAsApp()) return null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshData(queryClient);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => void refresh()}
      disabled={refreshing}
      aria-label="Refresh"
      data-testid="button-refresh"
    >
      <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
    </Button>
  );
}
