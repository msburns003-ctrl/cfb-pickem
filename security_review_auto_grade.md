# Pre-Publish Security Review — Automatic Scoring

**Scope:** Branch `claude/epic-bohr-tjyw9y` — adds a background job that saves final scores from ESPN and grades weeks automatically. Files touched: `server/auto-grade.ts` (new), `server/index.ts`, `server/routes.ts`, `client/src/pages/admin/week-detail.tsx`, `CLAUDE.md`, `README.md`, `.env.example`. No new dependencies, no database schema change, no new routes, no auth changes. Builds on the live-scores change reviewed in `security_review_live_scores.md`.

## What changed

- `startAutoGrade()` runs after the server starts listening. Every 5 minutes (first run 30s after boot) it looks at each non-setup week (skipping graded weeks more than 7 days past their deadline):
  1. If a selected game, or a game someone made their upset pick on, kicked off in the last 4 days and isn't final, it calls the existing `checkGamesForWeek` (the "Check Games" button's code). That function only updates games not already final, so hand-entered scores are never overwritten.
  2. Once the week's picks are locked (status not `open`, or deadline passed), it calls the existing `gradeCompletedGames` (the "Grade" button's code) when a final selected game's stored result is missing or doesn't match its score, or an upset pick on a final game is still pending. Grading waits for the lock because money games are only assigned then.
- After any write it invalidates the standings, grid and dashboard caches, as the admin write middleware does for manual grading.
- `GET /api/admin/weeks/:id` (still `requireAdmin`) now also returns `autoGrade: { enabled, status }` (last run time, number of scores saved, whether it graded, error message). The admin week page shows this.
- On/off: on when `NODE_ENV=production` (the production build sets this), off otherwise. `AUTO_GRADE=on|off` overrides. Local dev therefore never writes to the production database unless someone explicitly opts in.
- A per-process `running` flag stops overlapping runs. A run overlapping a manual admin grade is harmless: both compute the same values from the same scores and write them with idempotent upserts.

## Findings

1. **No new attack surface.** The job takes no external input except ESPN's public scoreboard, which "Check Games" already trusts. No new endpoints; the only API change is extra fields on an admin-only response.
2. **Data integrity.** The job reuses the existing scoring and score-matching code unchanged, so league rules (ATS threshold, money games, upset tiers, pushes) apply exactly as with manual grading. Tested against a stubbed database and ESPN feed: final games saved and graded correctly (including ATS, money game and upset points); in-progress games untouched; a hand-entered score not overwritten; an open week's score saved but not graded; a second run made no changes; an admin score correction was regraded on the next run.
3. **Wrong-match risk.** If ESPN's team-name matching ever picked the wrong game, a wrong score could now be graded without an admin looking first. This risk already existed with "Check Games", and the matching is conservative (exact names or aliases, plus containment only for names of 4+ characters). Mitigation: admins can correct a score on the week page and the next run regrades automatically; the admin page shows what the job last did.
4. **Availability.** ESPN requests time out after 10s, errors are caught per week, and a failed week is reported on the admin page without stopping other weeks. DB load is a few small reads per active week every 5 minutes.
5. **Logging.** Logs contain only week ids, counts and error messages. No credentials, tokens or member data.
6. **No client-side storage, no secrets.** Unchanged; production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## League rule change

`CLAUDE.md` listed "Grading runs through the app's own admin API" as a league rule. Grading still runs through the app's own grading code, now triggered automatically as well as manually. Updated in `CLAUDE.md` at the league admin's request. If the commissioner is someone else, confirm with them before publishing.

## Conclusion

A background job that reuses existing, reviewed score-checking and grading code, writes nothing new, adds no endpoints, and is off by default outside production. **Cleared to publish.**
