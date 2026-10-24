# Pre-Publish Security Review — Week Summary and Projected Points

**Scope:** Branch `claude/epic-bohr-tjyw9y` — removes the Cristo-Ball banner from the picks page, adds a "Your week so far" summary there, and adds projected (live) points to the picks grid. Files touched: `client/src/pages/dashboard.tsx`, `client/src/pages/grid.tsx`, `client/src/components/WeekSummary.tsx` (new), `client/src/components/GridByGame.tsx`, `client/src/components/GameCard.tsx` (status color only), `client/src/lib/projection.ts` (new), `client/src/lib/grid-pdf.ts` (types only), `shared/outcome.ts`, `server/scoring.ts`, `server/routes.ts`. No new endpoints, dependencies, schema or auth changes.

## What changed

- **Picks page:** the Cristo-Ball banner is gone (Cristo-Ball stays in the navigation). A summary card appears once something has started or been graded: graded record, how ungraded picks stand at the live score, upset pick status, official and projected points, and season rank (from the existing `/api/standings`).
- **Grid:** while picks ride on live scores, a "Proj" column shows each member's points if current scores hold, and the phone view's leaderboard ranks by projected points. The Upset column and the phone view's upset section show live status.
- **Server:** the grid response (`GET /api/weeks/:id/grid`) now includes each upset pick's `gameId` and an `upsetGames` list (the games members made upset picks on), so the client can find their scores. `upsetPickPoints` moved from `server/scoring.ts` to `shared/outcome.ts` (re-exported from `scoring.ts`, unchanged logic) so projections use the same tiers as grading.

## Findings

1. **No new data exposure.** The extra grid fields are game rows from the same week (teams, spread, kickoff, scores), which are already public in the app, plus the id of the game each member's already-visible upset pick is on. The grid keeps `requireAuth` and its `403` until picks lock, so upset picks are not revealed early. The summary card only uses the member's own dashboard data and the standings every member can already see.
2. **Projections are display-only.** Computed in the browser and labeled unofficial; nothing is written. Official points still come only from grading.
3. **Scoring unchanged.** `upsetPickPoints` moved without changes; `npm run check` confirms all callers still resolve.
4. **No injection risk.** All text renders through React; no `dangerouslySetInnerHTML`.
5. **No client-side storage.** Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Conclusion

Display-only additions using data members can already see, plus two read-only fields on an existing authenticated endpoint. **Cleared to publish.**
