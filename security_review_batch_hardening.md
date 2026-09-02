# Pre-Publish Security Review — cfb-pickem
**Scope:** Diff in commit `d2581464` (server/routes.ts + client/src/pages/dashboard.tsx) — try/catch isolation on the weekly picks batch save loop, and client-side reconciliation of partial saves on error.

## Security Review Results

### BLOCK (must fix before publishing)
None.

### WARN (inform user, let them decide)
None.

### PASS
- **Dependency audit** — `npm audit` reports 0 vulnerabilities across 586 dependencies (350 prod, 234 dev, 156 optional).
- **Hardcoded secrets scan** — No API keys, tokens, private keys, or hardcoded passwords found in source. `.env` contains `SUPABASE_URL` and `SUPABASE_ANON_KEY` — per project convention these are safe (injected securely at runtime, anon key is meant to be public-facing) and not a concern.
- **Dangerous code patterns** — Only one `dangerouslySetInnerHTML` hit, in `client/src/components/ui/chart.tsx:81`. It's pre-existing (untouched by this diff, last modified in commit `be3a6cc`) and only injects a `<style>` block built from static chart theme config (`THEMES`/`colorConfig` objects defined by the app, not user input) — not exploitable. No `eval`, `new Function`, `innerHTML =`, or `document.write` found anywhere.
- **CORS / auth on mutations** — No open-CORS (`Access-Control-Allow-Origin: *`, bare `cors()`) patterns found in the codebase. The batch endpoint `POST /api/weeks/:id/picks/batch` is gated by `requireAuth` middleware (`server/routes.ts:133`), confirmed unchanged by this diff.
- **Diff-specific review (server/routes.ts)** — The new try/catch around the per-entry save loop (`server/routes.ts:151-182`) catches errors per-entry so one failure can't crash the batch or drop already-saved entries. On error, the full exception is sent only to `console.error` (line 180, includes `gameId`/`userId` for debugging — not sensitive), while the client-facing response only ever gets a generic string, `"Couldn't save this one — try again"` (line 181). No stack traces or internal error details leak to the client.
- **Diff-specific review (client/src/pages/dashboard.tsx)** — The new `onError` reconciliation handlers (lines ~85-134 for batch picks, ~148-171 for the single upset pick) call `queryClient.fetchQuery` against the same authenticated `/api/weeks/${activeWeekId}/dashboard` endpoint the user was already querying — no new endpoint, no new auth surface, and results are scoped to the signed-in user's own picks (`fresh.myPicks`, `fresh.myUpsetPick`). No cross-user data exposure introduced.
- **Sensitive logging** — No new `console.log`/`console.error` of passwords, tokens, or full user objects. The single new log statement only includes a numeric `gameId` and `userId`.

## Fixes Applied
None required — no BLOCK findings.

## Conclusion
Clean. This change is scoped exactly as described (error-handling hardening only, no new endpoints/deps/auth changes) and introduces no new security risk. Safe to publish.
