# Pre-Publish Security Review — Live Game-Day Scores

**Scope:** Branch `claude/epic-bohr-tjyw9y` — adds read-only live scores from ESPN to the picks page, the picks grid, and the admin week page. Files touched: `server/scores.ts`, `server/routes.ts`, `server/cache.ts`, `server/scoring.ts`, `shared/schema.ts`, `shared/outcome.ts` (new), `client/src/hooks/use-live-scores.ts` (new), `client/src/components/GameCard.tsx`, `client/src/pages/dashboard.tsx`, `client/src/pages/grid.tsx`, `client/src/pages/admin/week-detail.tsx`. No new dependencies, no database schema change, no auth or config changes.

## What changed

- New endpoint `GET /api/weeks/:id/live-scores`, gated by `requireAuth`. For games in the week that have kicked off (within the last 8 hours) and aren't marked final in our database, it fetches the ESPN public scoreboard and returns each game's state (`in`/`post`), scores, and ESPN's short status text (e.g. "Halftime").
- Responses are cached in memory for 60 seconds per week (`live:v1:<weekId>`), with concurrent misses coalesced, so the whole league polling costs at most one ESPN round per minute per week. When no game is in progress the endpoint returns an empty map without calling ESPN.
- **Nothing is written to the database.** Saving scores still only happens through the admin "Check Games" / manual result entry, and points still only through `POST /api/admin/weeks/:id/grade`.
- The client polls the endpoint every 60 seconds, only while a game on screen is in progress. Game cards show the live score and whether the member's saved pick is winning/covering. The grid shows live scores in the column headers and marks ungraded picks as unofficially winning/losing (in italics, with a note). The admin week page notes when ESPN shows selected games final that haven't been saved yet.
- The winner/ATS calculation moved from `server/scoring.ts` into `shared/outcome.ts` so the live view and grading use the same code. Behavior is unchanged: checked against the old implementation on 16,810 score/spread combinations with identical results.
- ESPN fetches now time out after 10 seconds (also applies to "Check Games") instead of hanging indefinitely.

## Findings

1. **No new data exposure.** The endpoint returns only game scores, which are public information, keyed by our game ids. It returns no picks, member data, or anything else from our database. Live pick status on the grid is computed in the browser from grid data the member can already see, and the grid keeps its existing lock-timing check (`403` until picks lock), so no early reveal of picks.
2. **Input validation.** `:id` must be a positive integer and an existing week (`400`/`404` otherwise), so a client can't create unbounded cache entries; at most one entry per real week.
3. **Upstream abuse / DoS.** The 60s cache and request coalescing cap ESPN traffic regardless of how many members poll, and the 10s timeout stops a slow ESPN from tying up requests. ESPN errors resolve to empty results (existing behavior), and any unexpected error returns a generic `502` without internals.
4. **Untrusted upstream text.** ESPN's status text is truncated to 40 characters and rendered by React as plain text (no `dangerouslySetInnerHTML`), so there is no XSS vector. Scores are parsed with `Number()` and discarded if not numeric.
5. **No client-side storage.** Verified the production bundle contains no `localStorage`, `sessionStorage`, or `indexedDB`.
6. **No secrets.** No keys or credentials are involved; the ESPN scoreboard is a public, unauthenticated feed already used by "Check Games".

## Conclusion

One new authenticated, read-only endpoint that returns public score data, rate-limited by caching, with no database writes, no new dependencies, and no browser storage. Grading logic is unchanged. **Cleared to publish.**
