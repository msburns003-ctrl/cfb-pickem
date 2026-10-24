# Pre-Publish Security Review — Phone Navigation and By-Game Grid

**Scope:** Branch `claude/epic-bohr-tjyw9y` — UI-only changes for phones. Files touched: `client/index.html` (viewport meta), `client/src/components/AppShell.tsx`, `client/src/components/GridByGame.tsx` (new), `client/src/components/GameCard.tsx`, `client/src/pages/grid.tsx`, `client/src/pages/dashboard.tsx`. No server, schema, auth, config or dependency changes.

## What changed

- **Bottom tab bar on phones.** Below the `sm` breakpoint the main links (This Week, Cristo-Ball, Grid, Standings, and Admin for admins) move to a fixed bottom bar with icons and labels; the top bar keeps the logo, profile and log out. Desktop is unchanged apart from always showing link labels. `viewport-fit=cover` was added so the bar clears the iPhone home indicator.
- **By-game grid view on phones.** The grid page defaults to one card per game on phones: score (live or final), consensus bar, and member names under the side they picked, colored by result (with ✓/✗ icons when graded, italics when unofficial). Above the games is the week's points (ties share a rank) and below them the upset picks. A "By game / Table" switch keeps the full table available. Desktop still shows the table.
- The dashboard's "Save picks" bar sits above the bottom tab bar on phones, and game card headers wrap instead of squeezing on narrow screens.

## Findings

1. **No new data or endpoints.** The by-game view renders the same `GET /api/weeks/:id/grid` payload as the table (still `requireAuth`, still `403` until picks lock) and the existing live-scores data. The Admin tab shows only for admins, as before; admin routes keep their server-side `requireAdmin` checks regardless.
2. **No injection risk.** Member and team names render as React text; no `dangerouslySetInnerHTML`.
3. **No client-side storage.** The view choice is in-memory React state only. Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.
4. **Hidden members.** The by-game view uses the same grid rows as the table, so members hidden from the grid stay hidden.

## Conclusion

Client-only layout changes that reuse existing authenticated data. **Cleared to publish.**
