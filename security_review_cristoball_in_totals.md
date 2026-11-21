# Pre-Publish Security Review — Cristo-Ball Live Points in Season Totals

**Scope:** Branch `claude/cristoball-projected`, built on pull request #27 (live Cristo-Ball points, display-only; see `security_review_cristo_ball_live_results.md`). This change makes those live points count in season totals and ranks. Files touched: `server/scoring.ts` (`computeStandings` total), `server/routes.ts` (standings cache cleared when Cristo-Ball results are saved or graded), `client/src/pages/standings.tsx` and `client/src/pages/admin/cristoball.tsx` (wording; standings refresh after saving results), `tests/scoring.test.ts`. No schema, auth or dependency changes.

## What changed

- Before: live Cristo-Ball points (earned so far against the actuals an admin has entered) showed in the Cristo-Ball column but were left out of Total until the final grade.
- Now: until the final grade, each member's Total and rank include their live Cristo-Ball points. After the final grade, the stored official points are used, as before. Members with no entry, and undecided questions, count 0.
- Rank-change arrows compare current and prior standings with the same Cristo-Ball points on both sides, so they still reflect weekly movement.
- Saving actual results or grading clears the 30-second standings cache, and the admin page refreshes standings after a save, so totals update immediately.
- Wording on the standings column and the admin grade dialog no longer says "display-only".

## Findings

1. **No new data exposure.** The live per-member Cristo-Ball totals were already returned to all members by #27; this only adds them into `totalPoints`. No individual picks or new fields are exposed.
2. **Inputs unchanged.** Actual results are still written only through the admin routes (admin session required, Zod-validated).
3. **No writes on read.** Standings compute live points in memory; nothing is saved until an admin runs the final grade.
4. **Storage rule respected; `API_BASE` placeholder untouched.**

## Testing

`npm run check` passes, `npm test` passes (74 tests; the live Cristo-Ball standings test now asserts totals and rank include live points). `npm run build` succeeds.

## Conclusion

A scoring change using existing grading logic and admin-entered data, with no new exposure. **Cleared to publish.**
