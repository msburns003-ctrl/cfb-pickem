# Pre-Publish Security Review — Rate Limiting

**Scope:** Branch `claude/epic-bohr-tjyw9y`. Replaces the unmerged pull request #1 ("Add rate limiting to API endpoints", August 2026), rebuilt on the current code. Files touched: `server/rate-limit.ts` (new), `server/auth.ts`, `server/routes.ts`, `tests/rate-limit.test.ts` (new), `tests/api.test.ts`, `tests/password-reset.test.ts`, `CLAUDE.md`, `README.md`. No new dependencies, no schema change.

## What changed

- **Login lockout per account.** Failed logins are counted per email (case-insensitive). After 5 failures in 15 minutes the account is locked until the window ends, including for the correct password, so guessing can't continue; the response is `429` with `Retry-After` and a message pointing to Forgot password. A successful login clears the count. Unknown emails are counted the same way, so lockouts don't reveal which emails are members. Wrong current passwords on the change-password form count toward the same lockout.
- **Per-member request limits.** Inside `requireAuth`, once the member is known: 300 requests/minute and 60 writes/minute per member (600 and 120 for admins). Over the limit: `429` with `Retry-After`. These sit far above normal use, including game-day polling and refreshes.
- **Malformed session tokens** (anything but 64 hex characters, the only format the server issues) are rejected before any database lookup.
- "Forgot password" keeps its own limits (3 emails per address per 15 minutes).

## Why not the August version

PR #1 keyed limits by IP and enabled `trust proxy`, but its limiters ran before authentication, so its per-user keys and admin exemption never applied and every limit was per IP. Members on one network (a watch party, a household) would have shared a single 5-failure login bucket and a 120/minute read bucket, and correctness depended on the unverified hop count of the pplx.app proxy. It also predated most current routes. This version keys every limit by account, so it doesn't depend on the proxy or on client IPs, and `trust proxy` stays off.

## Findings

1. **Brute force.** At most 5 guesses per account per 15 minutes. Spreading guesses across accounts is still capped at 5 per account; scrypt keeps each guess expensive.
2. **Lockout as a nuisance.** Someone who knows a member's email can keep that account locked by failing logins. That's the accepted trade-off of account lockout; the member can still get in via Forgot password (once email is set up) or an admin reset, which don't depend on the login counter.
3. **No IP trust.** Nothing reads `X-Forwarded-For`, so spoofed headers can't dodge or redirect limits.
4. **Memory.** Counters are in memory with expired entries swept every 5 minutes; keys are bounded by members and attempted emails within a window.
5. **No client changes, no client storage.** Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Testing

`tests/rate-limit.test.ts` (9 tests): lockout after 5 failures including for the right password, with `Retry-After`; another member on the same network unaffected; unlock after the window; occasional typos never lock anyone out; unknown emails treated the same; change-password failures counted; per-member and write caps, admin caps, reset after the window; `429` with `Retry-After` from a real route while other members are unaffected; malformed tokens rejected without a database lookup. Full suite: 63 passing.

## Conclusion

Account-keyed limits that stop password guessing and runaway clients without risking shared lockouts or depending on the proxy. **Cleared to publish.**
