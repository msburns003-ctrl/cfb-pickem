import type { QueryClient } from "@tanstack/react-query";

// Keeps data fresh when members come back to the app, which matters most in
// the home-screen app: it has no pull-to-refresh or reload button, and the
// phone can keep it suspended for days. Queries deliberately don't refetch
// on every focus (members flip to ESPN constantly on game day), so instead:
//   - back after REFETCH_AFTER_MS hidden: refetch the data on screen
//   - back after RELOAD_AFTER_MS hidden: reload the page, picking up any
//     newly published version (skipped while picks are unsaved)
const REFETCH_AFTER_MS = 2 * 60 * 1000;
const RELOAD_AFTER_MS = 30 * 60 * 1000;

let unsavedChanges = false;

/** Pages with unsaved edits set this so a return reload never discards them. */
export function setUnsavedChanges(value: boolean) {
  unsavedChanges = value;
}

export function refreshData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ refetchType: "active" });
}

export function startAppRefresh(queryClient: QueryClient) {
  let hiddenAt: number | null = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt === null) return;
    const away = Date.now() - hiddenAt;
    hiddenAt = null;
    if (away >= RELOAD_AFTER_MS && !unsavedChanges) {
      window.location.reload();
    } else if (away >= REFETCH_AFTER_MS) {
      void refreshData(queryClient);
    }
  });
}
