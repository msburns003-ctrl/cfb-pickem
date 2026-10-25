# Pre-Publish Security Review — Week History on Stats

**Scope:** Branch `claude/epic-bohr-tjyw9y`. Files touched: `client/src/pages/stats.tsx`, `client/src/components/WeekPicks.tsx` (new). Client-only; no server, schema, auth or dependency changes.

## What changed

Tapping a week on the stats page chart (or its row in the week table) shows that member's picks for the week: each game with the pick, spread, final score, result and points, plus the upset pick. Bars are focusable and selectable with Enter/Space.

## Findings

1. **No new data exposure.** The panel reads the existing `GET /api/weeks/:id/grid` endpoint, which every member can already open for any locked week on the Grid page, and which keeps its `403` until picks lock. Stats only list graded weeks, so the panel never shows picks earlier than the grid would. Members hidden from the grid stay hidden ("Pick history isn't shown for this member").
2. **No injection risk.** All text renders through React.
3. **No client-side storage.** The selected week is in-memory state. Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Conclusion

A new view of data members can already see. **Cleared to publish.**
