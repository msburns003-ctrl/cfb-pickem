# Pre-Publish Security Review — Refresh and Pull-to-Refresh in the Home-Screen App

**Scope:** Branch `claude/epic-bohr-tjyw9y` — a refresh button for the home-screen app and automatic refresh when members come back to the app. Files touched: `client/src/lib/app-refresh.ts` (new), `client/src/components/RefreshButton.tsx` (new), `client/src/components/PullToRefresh.tsx` (new), `client/src/components/AppShell.tsx`, `client/src/App.tsx`, `client/src/pages/dashboard.tsx`, `client/src/lib/queryClient.ts` (comment). Client-only; no server, schema, auth or dependency changes.

## What changed

- **Refresh button** in the header, shown only when the site is opened as a home-screen app (which has no reload button or, on iPhone, pull-to-refresh). It refetches the data on screen without reloading the page, so unsaved picks are kept.
- **Pull-to-refresh** in the home-screen app only (browser tabs keep the browser's own): pulling down from the top of the page shows a spinner and refetches the data on screen, without reloading. It ignores short pulls, sideways swipes (e.g. scrolling the grid), pulls that start while the page or a panel is scrolled down, and multi-finger gestures. Touch listeners are passive, so normal scrolling is never blocked.
- **Coming back to the app or tab:** after 2+ minutes away, the data on screen is refetched; after 30+ minutes away, the page reloads to pick up any newly published version. The reload is skipped while the picks page has unsaved picks (it refetches instead). Quick switches (e.g. checking ESPN) do nothing, keeping the existing "no refetch on every focus" behavior.

## Findings

1. **No new requests types or data.** Refreshing re-runs the same authenticated GET requests the pages already make; server-side caches (10-60s) absorb repeated refreshes.
2. **No lost work.** Unsaved picks block the automatic reload; the manual button never reloads.
3. **No client-side storage.** Timing and the unsaved flag are in-memory only. Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.
4. **No injection risk.** No user content involved.

## Testing

Against the production build in a phone-size browser: no refresh button in a normal tab; in app mode the button refetched the picks data; a long pull from the top showed the spinner and refetched, while a short pull, a sideways swipe, a pull while scrolled down, and a pull in a normal browser tab did nothing; returning after 30 seconds did nothing, after 3 minutes refetched, after 31 minutes reloaded; with an unsaved pick, returning after 31 minutes refetched without reloading and the pick stayed staged.

## Conclusion

Client-only refresh controls reusing existing requests. **Cleared to publish.**
