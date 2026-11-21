# Security Review — Live Cristo-Ball Points & Member Result Badges

## Summary

Two related changes to Cristo-Ball:

1. **Live standings points (display-only):** `computeStandings` now grades every Cristo-Ball entry on the fly against whatever actual results the admin has entered so far, exposing the earned-so-far total per member as `cristoBallLivePoints`. These points are never added to `totalPoints` — the official lump sum still only lands when the admin runs the final grade (`gradedAt` set). A new `cristoBallProgress()` helper counts decided questions (out of 41) so the UI only enters "live" mode once at least one actual exists.
2. **Member result badges:** `GET /api/cristoball/me` now also returns the season's decided actual results **once entries are locked**, and the member Cristo-Ball page renders a green check (+pts) / red X (+0) badge on each question whose actual has been entered, plus a "Your Cristo-Ball score so far" card while the season is live.

## Changes

- **`server/scoring.ts`**: `StandingsRow` gains `cristoBallLivePoints: number | null`. `computeStandings` loads entries whenever a results row exists (not only when graded) and computes live points via the existing `gradeCristoBallEntry` — no new grading logic, purely a second read path over the same function. New exported `cristoBallProgress(results)` counts decided questions across every section.
- **`server/routes.ts`**: `GET /api/standings` payload adds `cristoBall: { decided, total } | null` (from `cristoBallProgress`). `GET /api/cristoball/me` adds `results` — the actuals object (picks, season answers, choice picks, win totals, national champ, playoff teams, Heisman) — but **only when the lock deadline has passed**; before the lock it is `null` so members editing picks can never see answers. No new write endpoints.
- **`client/src/pages/standings.tsx`**: Cristo-Ball column shows live points with an "X of Y decided" header and tooltips while live; final points after grading, exactly as before. Total column untouched by live points.
- **`client/src/pages/cristoball.tsx`**: `ResultBadge` component (green/red, static content only). Status helpers compare the member's locked picks against actuals with trim/case-insensitive matching, mirroring `gradeCristoBallEntry`. Playoff slots only mark a miss once all four actual teams are entered. "Score so far" card only renders when locked, actuals exist, and the entry isn't officially graded yet.
- **`client/src/pages/admin/cristoball.tsx`**: helper text noting partial actual saves are fine. No logic changes.
- **`tests/`**: fake storage gains db-backed Cristo-Ball results/entries/entry builders; 6 new tests (partial grading math, empty actuals, post-grade behavior, decided-count, actuals shared when locked, hidden before lock).

## Findings

### BLOCK
None.

### WARN
- The member Cristo-Ball page now displays admin-entered actuals to all members once locked. These are public sports facts (e.g., "Oklahoma won 6 games"), and entries are locked before any actual is meaningful, so there is no gaming vector. Accepted.

### PASS
- **No new write endpoints.** Only `GET /api/standings` (already `requireAuth`) and `GET /api/cristoball/me` (already `requireAuth`) changed shape.
- **Actuals are never sent before the lock deadline** — enforced server-side in the route, not just hidden in the UI. Test covers this directly.
- `gradeCristoBallEntry` is reused unchanged for live scoring, so live points and the official grade can't diverge in logic.
- Live points are computed, not persisted — no new columns, no migration, no way for a stale `pointsEarned` to leak into standings early.
- No client-side rendering of user-controlled HTML; badges render static strings from the shared schema constants and DB text fields through normal React text nodes.
- No SQL interpolation — all reads via the existing Supabase query builder.
- No CORS, session, or auth changes; admin actuals entry remains `requireAdmin` behind the existing `/api/admin` invalidation middleware.
- Cache: standings stays cached 30s and is invalidated by the existing admin-write middleware, so entering actuals shows up within 30s.

## Tested

- `npm run check` (tsc) clean; `npm run build` passes; all 74 tests pass (6 new).
- Manual verification against the production database after entering the eight decided 2026 actuals: all 36 entries live-grade correctly (e.g., Air Force over and Navy under scored for members who picked them; Kiffin 10+ wins scored as a miss for everyone who said yes).
- Post-deploy: verified the standings Cristo-Ball column shows live points ("8 of 41 decided") and the Cristo-Ball tab shows green/red badges per decided question for a logged-in member.
