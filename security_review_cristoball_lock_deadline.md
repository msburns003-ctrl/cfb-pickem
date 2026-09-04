# Security Review — Cristo-Ball Lock Deadline Setting

## Summary

Adds a dedicated, admin-configurable entry lock deadline for Cristo-Ball, stored on `cristo_ball_results.lock_deadline` (new nullable `timestamptz` column). Previously the Cristo-Ball lock deadline was hardcoded to always equal the earliest weekly pick deadline in the season (Week 1's deadline), which meant reopening Cristo-Ball required reopening Week 1's picks for everyone. This change decouples the two.

## Changes

- **DB**: `ALTER TABLE public.cristo_ball_results ADD COLUMN lock_deadline timestamptz NULL;` — additive, nullable, no data migration needed, no existing behavior affected until an admin explicitly sets it.
- **`server/scoring.ts`**: `getCristoBallLockDeadline()` now checks `cristo_ball_results.lock_deadline` first; falls back to the legacy Week-1-deadline calculation only when unset (`null`). Backward compatible — every season with no explicit deadline behaves exactly as before.
- **`server/routes.ts`**: New endpoint `PUT /api/admin/cristoball/lock-deadline`, gated by `requireAdmin` (same auth middleware as every other admin write in the app). Accepts `{ lockDeadline: string | null }`, validated via a dedicated Zod schema plus an explicit `Date` parse check before persisting. Setting `null` reverts to the legacy fallback.
- **`server/storage.ts`**: New `setCristoBallLockDeadline()` method — updates the existing `cristo_ball_results` row for the season, or creates one with empty result fields if none exists yet (mirrors the existing `upsertCristoBallResults` pattern).
- **`shared/schema.ts`**: New `insertCristoBallLockDeadlineSchema` (`{ lockDeadline: z.string().nullable() }`) and `lockDeadline` field added to the `CristoBallResults` interface.
- **`client/src/pages/admin/cristoball.tsx`**: New "Entry lock deadline" card with a `datetime-local` input (Eastern Time, reusing the app's existing `isoToEasternInputValue`/`easternInputValueToIso` helpers used elsewhere for week deadlines) and a "Clear" button to revert to the legacy fallback. No new client-side auth logic — page is already behind the existing admin route guard.

## Findings

### BLOCK
None.

### WARN
None.

### PASS
- New endpoint requires admin auth (`requireAdmin`), same as every other write under `/api/admin`. No new unauthenticated surface.
- Input validated with Zod (`z.string().nullable()`) plus an explicit `Date` parse check server-side before any DB write; malformed/non-date strings are rejected with 400.
- No new client-side rendering of user-controlled HTML (no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `document.write` introduced).
- No hardcoded secrets, keys, or credentials introduced in any changed file.
- No SQL string interpolation — uses the existing Supabase query builder (`.update(...)`, `.insert(...)`) exclusively, consistent with the rest of `storage.ts`.
- No CORS changes.
- Purely additive DB migration (nullable column, no backfill/rewrite of existing rows beyond the one already-present `cristo_ball_results` row for the 2026 season, which defaults to `null` and preserves current behavior).
- Change is isolated to the admin Cristo-Ball surface; no changes to member-facing pick submission, grading, standings, or session/auth handling.

## Tested

End-to-end via a throwaway admin test account (created and deleted via direct Supabase insert/delete, scrypt-hashed per the existing test pattern) against a local server pointed at production Supabase:
- Setting a future lock deadline via the new UI — confirmed the status text and unlock state update immediately.
- Reloading the page — confirmed the value persists (stored server-side, not client state).
- Clearing the deadline — confirmed it correctly falls back to the legacy Week-1-deadline behavior and status text.
- Confirmed the production `cristo_ball_results` row and `users` table were restored to their exact pre-test state (`lock_deadline` back to `null`, roster back to 42) after cleanup.

## Conclusion

**Cleared to publish.** No new data exposure, no new unauthenticated endpoint, no auth/session changes. The change is a narrow, admin-gated settings addition with backward-compatible defaults.
