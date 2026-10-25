# Pre-Publish Security Review — Current Week and Pinned Columns on Standings

**Scope:** Branch `claude/epic-bohr-tjyw9y` — shows the week being played on the standings page. Files touched: `server/routes.ts` (`GET /api/standings`), `client/src/pages/standings.tsx`. No schema, auth or dependency changes.

## What changed

- `GET /api/standings` (still `requireAuth`, cached 30s) also returns `currentWeek`: the latest week whose picks are locked (status `locked`, or `open` past its pick deadline) but that isn't fully graded. Its points were already included in each member's total as games are graded; until now it just had no column.
- On narrow screens the standings table keeps Rank, Δ and Member pinned on the left and Total pinned on the right while week columns scroll (CSS `position: sticky` only).
- The standings table adds a highlighted "Week N · in progress" column with each member's points so far, and the Weekly Winners table adds an "in progress" row showing who's leading (no payout shown until the week is graded).

## Findings

1. **No early reveal.** The current week only appears after its picks lock, and its points come from graded picks only, which exist only after games finish. No picks are exposed; only point totals members could already infer from the season totals.
2. **No new data.** `currentWeek` is a week row from the same table already returned in `weeks` (label, deadline, status, payout fields), all visible elsewhere to members.
3. **No client-side storage.** Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Conclusion

Adds one already-visible week row to an existing authenticated response and a display column. **Cleared to publish.**
