# Pre-Publish Security Review — cfb-pickem
**Scope:** Fixes for weekly picks not saving (client/src/pages/dashboard.tsx, server/cache.ts, server/storage.ts):
1. The error-path "did it actually save?" check now forces a real refetch (`staleTime: 0`) instead of reading back the optimistic cache, which had been telling members a failed save succeeded.
2. Picks the server skips (e.g. kickoff passed) are re-staged on the page instead of silently disappearing.
3. The server response cache no longer stores or shares a dashboard read that started before a pick was saved (stale "old picks" for up to 10s after saving).
4. `upsertPick` is a single atomic `INSERT ... ON CONFLICT (game_id, user_id)` instead of read-then-insert.

## Security Review Results

### BLOCK (must fix before publishing)
None.

### WARN (inform user, let them decide)
- **Pre-existing dependency advisories** — `npm audit --omit=dev` reports advisories in `body-parser` (high), `dompurify` (critical) and `postcss-selector-parser` (moderate). The same report appears without this change; no dependencies were added or changed here. Most have a fix via `npm audit fix`; worth doing as a separate change.

### PASS
- **Auth on mutations** — No routes added or changed. `POST /api/weeks/:id/picks`, `/picks/batch` and `/upset-pick` are still gated by `requireAuth`, and `userId` still comes from the session (`req.user!.id`), never the request body.
- **Database write (server/storage.ts)** — `upsertPick` writes only `game_id`, `user_id`, `selected_team`, `submitted_at` (from the validated `InsertPick`), so grading columns (`is_correct`, `points_earned`) can't be set or cleared by a member. Conflict target matches the existing `unique (game_id, user_id)` constraint. Errors still go through `assertNoError`; nothing new returned to the client.
- **Cache (server/cache.ts)** — Change only makes invalidation stricter (drops in-flight reads, skips storing reads that began before a write). Cache keys are unchanged and still scoped per user, so no cross-user data exposure.
- **Client (dashboard.tsx)** — No new endpoints, storage, or logging. No `localStorage`/`sessionStorage`/`indexedDB` use. `API_BASE` placeholder untouched.
- **Secrets / logging** — No secrets added; no new log statements.

## Fixes Applied
None required — no BLOCK findings.

## Conclusion
Clean. Bug-fix scope only; no new endpoints, dependencies, or auth changes. Safe to publish.
