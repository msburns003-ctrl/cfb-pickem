# Pre-Publish Security Review — Cristo-Ball Points in Season Totals

**Scope:** Branch `claude/cristoball-projected`. Season standings now count Cristo-Ball points before season-end grading, from the results an admin has saved so far. Files touched: `server/scoring.ts` (`computeStandings`), `server/routes.ts` (cache invalidation on Cristo-Ball results save and grade), `client/src/pages/standings.tsx` ("so far" label), `tests/fake-storage.ts`, `tests/scoring.test.ts`. No schema, auth or dependency changes.

## What changed

- Before: the Cristo-Ball column showed "–" and added nothing to totals until an admin pressed **Grade Cristo-Ball**.
- Now: as soon as any Cristo-Ball results are saved on the admin page, each member's entry is scored against them with the existing `gradeCristoBallEntry` and added to their season total and rank. Picks whose answers aren't saved yet score 0. Members with no entry get 0.
- Once Cristo-Ball is graded, the stored graded points are used, exactly as before.
- The column header says "so far" until grading. The totals also flow into ranks, rank-change arrows (applied equally to current and prior standings, so arrows still reflect weekly movement), My stats and the This Week season summary. Weekly winners are unaffected.
- Saving Cristo-Ball results or grading now clears the 30-second standings cache, so totals update at once.

## Findings

1. **No new data exposure.** Standings already showed each member's Cristo-Ball total after grading; now it shows earlier. Only point totals are returned, never anyone's individual Cristo-Ball picks or the admin's results. Entries are locked after the Cristo-Ball deadline, so seeing totals mid-season can't be used to change picks.
2. **Admin-only inputs.** Results are still written only through `/api/admin/cristoball/results` (admin session required, Zod-validated). Nothing new accepts input.
3. **No writes on read.** Standings compute points in memory; they don't save `pointsEarned`. Grading still happens only when an admin presses Grade.
4. **Storage rule respected; `API_BASE` placeholder untouched.**

## Testing

`npm run check` passes, `npm test` passes (71 tests, 3 new: no results yet, points so far before grading, graded points after grading). `npm run build` succeeds. The standings page was checked with mocked data: the "so far" label and totals render correctly.

## Conclusion

A scoring-display change using existing grading logic and admin-entered data. **Cleared to publish.**
