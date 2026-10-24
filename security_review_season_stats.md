# Pre-Publish Security Review — Season Stats

**Scope:** Branch `claude/epic-bohr-tjyw9y` — adds a season stats page for every member and a league leaders strip on the standings page. Files touched: `server/scoring.ts` (`computeSeasonStats`), `server/routes.ts`, `server/cache.ts`, `shared/schema.ts` (types), `client/src/pages/stats.tsx` (new), `client/src/components/LeagueLeaders.tsx` (new), `client/src/pages/standings.tsx`, `client/src/pages/profile.tsx`, `client/src/components/AppShell.tsx`, `client/src/App.tsx`. No new dependencies, schema or auth changes.

## What changed

- New endpoint `GET /api/stats` (`requireAuth`). Returns, for each member: season rank and total (from the existing `computeStandings`, so totals match standings), pick records overall / against the spread / straight up / money games, upset record and bonus points, weekly wins and pushes (ties for top score), best week, longest and current streak, and per-week points with week and season rank. Also the league average per week. Built from graded picks only.
- Cached for 30s under the `standings:` prefix, so grading (manual or automatic) and admin writes invalidate it along with standings.
- New page `/stats/:id?` (your own stats by default; a member picker for others), linked from standings member names, a "My stats" button on standings, and the profile page. Includes stat tiles, a points-by-week bar chart with the league average, and a week-by-week table.
- Standings page shows season leaders: most weekly wins, best pick rate (minimum half the most graded picks), upset points, longest streak.

## Findings

1. **No early reveal of picks.** Stats use only graded picks (`isCorrect` set, upset `result` not pending). Grading only happens after games are final, which is after picks lock, so nothing here exposes a pick before the grid would. No individual picks are returned, only aggregates.
2. **No sensitive fields.** The response contains member ids, names and numbers. No emails, password hashes or session tokens (members come from `computeStandings`, which only carries id and name).
3. **Load.** One pass over the season's weeks, cached for 30s and coalesced, the same cost profile as standings.
4. **No injection risk.** All text renders through React; no `dangerouslySetInnerHTML`.
5. **No client-side storage.** Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Conclusion

One read-only, authenticated endpoint returning aggregates of already-graded, already-visible results. **Cleared to publish.**
