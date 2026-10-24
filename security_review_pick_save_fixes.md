# Pre-Publish Security Review — cfb-pickem
**Scope:** Fixes for weekly picks not saving (client/src/pages/dashboard.tsx, server/cache.ts, server/storage.ts):
1. The error-path "did it actually save?" check now forces a real refetch (`staleTime: 0`) instead of reading back the optimistic cache, which had been telling members a failed save succeeded.
2. Picks the server skips (e.g. kickoff passed) are re-staged on the page instead of silently disappearing.
3. The server response cache no longer stores or shares a dashboard read that started before a pick was saved (stale "old picks" for up to 10s after saving).
4. `upsertPick` is a single atomic `INSERT ... ON CONFLICT (game_id, user_id)` instead of read-then-insert.
5. Picks page locks each game at its own kickoff (and the week at its deadline) while the page is open, instead of only when the dashboard was loaded (dashboard.tsx, GameCard.tsx, new hooks/use-now.ts).
6. Underdog dropdown hides games that have kicked off, and members can change their underdog pick until its game kicks off (UpsetPickPanel.tsx).
7. `POST /api/weeks/:id/upset-pick` now refuses to change an existing underdog pick once that pick's game has kicked off (server/routes.ts). Previously the server only checked the new game's kickoff, so a member could swap away from an underdog that was already losing.

## Security Review Results

### BLOCK (must fix before publishing)
None.

### WARN (inform user, let them decide)
- **Pre-existing dependency advisories** — `npm audit --omit=dev` reports advisories in `body-parser` (high), `dompurify` (critical) and `postcss-selector-parser` (moderate). The same report appears without this change; no dependencies were added or changed here. Most have a fix via `npm audit fix`; worth doing as a separate change.

### PASS
- **Auth on mutations** — No routes added; only `/upset-pick` gained an extra check (below). `POST /api/weeks/:id/picks`, `/picks/batch` and `/upset-pick` are still gated by `requireAuth`, and `userId` still comes from the session (`req.user!.id`), never the request body.
- **Upset-pick guard (server/routes.ts)** — New check tightens an existing authenticated route; it reads only the caller's own upset pick (`req.user!.id`) and returns a generic message. Client-side kickoff locks are convenience only; the server checks remain the source of truth.
- **Database write (server/storage.ts)** — `upsertPick` writes only `game_id`, `user_id`, `selected_team`, `submitted_at` (from the validated `InsertPick`), so grading columns (`is_correct`, `points_earned`) can't be set or cleared by a member. Conflict target matches the existing `unique (game_id, user_id)` constraint. Errors still go through `assertNoError`; nothing new returned to the client.
- **Cache (server/cache.ts)** — Change only makes invalidation stricter (drops in-flight reads, skips storing reads that began before a write). Cache keys are unchanged and still scoped per user, so no cross-user data exposure.
- **Client (dashboard.tsx)** — No new endpoints, storage, or logging. No `localStorage`/`sessionStorage`/`indexedDB` use. `API_BASE` placeholder untouched.
- **Secrets / logging** — No secrets added; no new log statements.

## Fixes Applied
None required — no BLOCK findings.

## Conclusion
Clean. Bug-fix and pick-lock UX scope only; no new endpoints, dependencies, or auth changes. One server rule tightened (no changing an underdog pick after its game kicks off). Safe to publish.
