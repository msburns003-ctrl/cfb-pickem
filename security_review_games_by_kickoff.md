# Pre-Publish Security Review — Games Listed by Kickoff Time

**Scope:** Branch `claude/sort-games-by-kickoff`. Week 10's games were not shown in kickoff order. Files touched: `server/storage.ts` (`listGamesByWeek` ordering), `server/scoring.ts` (money-game tiebreak made explicit), `tests/fake-storage.ts` (mirrors the new order), `tests/scoring.test.ts` (new test). No routes, schema, auth, client or dependency changes, and no data is modified.

## What changed

- `listGamesByWeek` sorted by `sort_order` first and `kickoff` second. `sort_order` is just the order games arrived from the ESPN import (later imports are appended), so games could show out of time order. It now sorts by `kickoff` first, with `sort_order` only breaking ties between games at the same time.
- Every view that lists a week's games through this method follows: This Week, the grid and its PDF, and the admin week page. Existing weeks are fixed immediately, with no database update needed.
- Nothing in the app lets admins set `sort_order` by hand, so no admin-chosen order is lost.

## Findings

1. **Read-only change.** Only the `ORDER BY` of an existing query changed. No new inputs, filters or data exposure.
2. **No effect on scoring.** Grading and standings don't depend on list order. Money-game assignment did: when two games are equally evenly split, the tie went to whichever came first in the list (import order). That tiebreak is now written explicitly as `sortOrder`, so which game becomes a money game is exactly the same as before. A new test pins it (it fails without the fix).
3. **Storage rule respected; `API_BASE` placeholder untouched.**

## Testing

`npm run check` passes, `npm test` passes (68 tests), `npm run build` succeeds.

## Conclusion

A display-order change to one read query. **Cleared to publish.**
