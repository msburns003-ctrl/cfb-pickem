# Pre-Publish Security Review — ESPN Game Import and Automatic Next Week

**Scope:** Branch `claude/epic-bohr-tjyw9y` — imports a week's games and betting lines from ESPN, and creates the next week automatically once the latest week is graded. Files touched: `server/schedule.ts` (new), `server/scores.ts` (exported helpers and ESPN types), `server/auto-grade.ts`, `server/routes.ts`, `client/src/pages/admin/week-detail.tsx`, `CLAUDE.md`, `README.md`. No new dependencies, schema or auth changes.

## What changed

- **`POST /api/admin/weeks/:id/games/import-espn`** (`requireAdmin`, no request body; the week id must be a positive integer). Fetches ESPN's public scoreboard for every FBS game (`groups=80`) kicking off from 4 days before the week's pick deadline to 3 days after, and:
  - adds games not already in the week as unselected candidates, with teams, rankings, kickoff, TV, favorite and spread (pick type computed with the existing `computePickType`);
  - refreshes the line, kickoff, TV and rankings on existing games only when nobody has a pick or upset pick on them and they haven't kicked off, so no pick changes meaning;
  - skips and reports games ESPN has no line for.
  An existing game matches by ESPN id or by both team names (the existing, conservative matcher), so hand-entered or previously imported games aren't duplicated.
- **Automatic next week** (in the existing production-only background job): when the season's latest week is `graded` and the next doesn't exist, it creates it in `setup` (hidden from members until the admin opens it) with the deadline one week later at the same Eastern time (DST-safe), the same money game count, and ESPN's games imported. It skips if the new deadline is already past or ESPN lists no games, and tries at most every 6 hours.
- **Admin week page:** an "Import from ESPN" button, with a list of games that had no line.

## Findings

1. **Admin-only writes.** The new route is behind `requireAdmin`, and the admin write middleware invalidates cached reads after it. The background job is the same process-internal job reviewed in `security_review_auto_grade.md`, on only in production.
2. **Untrusted upstream data.** ESPN values are only used as plain fields: team names and TV text are stored as strings and rendered by React as text; spreads must be finite numbers; kickoffs must parse as dates; ranks are kept only if 1-25. Games with an unparseable line are skipped rather than guessed.
3. **League integrity.** Imported games are never selected automatically, and a new week starts in `setup`, so nothing reaches members until the admin picks the slate and opens the week. Lines never change on a game someone has picked.
4. **Availability.** ESPN requests reuse the existing 10s timeout; failures yield no games, so nothing is created. The next-week check runs at most every 6 hours.
5. **Logging.** Logs contain week labels, ids and counts only.
6. **No client-side storage, no secrets.** Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Testing

Against a stubbed database and ESPN feed: week 9 was created in setup with the right deadline (including across the November DST change) and money game count; games came in with ranks, TV, favorite and spread, and "EVEN" became a straight-up game; a game without a line was reported, not added; a game from the following Tuesday was excluded; re-importing refreshed a moved line, left a picked game alone, and recognized a hand-entered game with home/away flipped instead of duplicating it. Not tested against the real ESPN feed (not reachable from the dev environment).

## Conclusion

An admin-only import and a production-only background step that add unselected candidate games to a hidden week. **Cleared to publish.**
