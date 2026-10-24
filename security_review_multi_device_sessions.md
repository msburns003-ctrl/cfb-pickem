# Pre-Publish Security Review — Stay Logged In Across Devices

**Scope:** Branch `claude/epic-bohr-tjyw9y` — stops members being logged out when they use more than one device. Files touched: `server/routes.ts` (login, logout, `/api/auth/me`, change-password). No schema, dependency or client changes.

## Problem

Each member has a single session token (`users.auth_token`). Every login replaced it and every logout cleared it, so logging in on one device logged the member out everywhere else, and logging out anywhere logged them out everywhere. iPhone home-screen apps keep cookies separate from Safari, so members using both were logged out constantly. The cookie itself already lasts 180 days.

## What changed

- **Login** reuses the member's existing token if there is one (a new random 32-byte token is only generated when none exists), so every device a member logs in on shares it.
- **Logout** clears this device's cookie only; it no longer clears the token, so other devices stay logged in.
- **`GET /api/auth/me`** (called when the app opens) re-sends the session cookie with a fresh 180-day `Max-Age`, so active members don't hit the expiry. Same cookie attributes as before: `__Host-` prefix, `HttpOnly`, `Secure`, `Path=/`, `SameSite=Lax`.
- **Change password** now issues a new token, signing out every other device, and sets it on the current device. The admin password reset still clears the token (signs out everywhere), unchanged.

## Findings

1. **Trade-off: logout no longer revokes the token server-side.** A copied cookie stays valid after the member logs out on that device, until they change their password or an admin resets it. Before, logout revoked it. Mitigations: the cookie is `HttpOnly` (not readable by page script) and `Secure`; tokens remain 256-bit random; "change password" is the member's sign-out-everywhere lever, and admins can force it with a reset. Given a small private league and the usability problem, this is acceptable for now. The full fix is a per-device sessions table (one row per login, revocable individually), which needs a database migration.
2. **No new exposure of tokens.** Tokens are still never logged or returned in JSON (`toPublicUser` strips `authToken`); only the existing `Set-Cookie` header carries them.
3. **Password change is stricter than before.** Previously changing a password left every existing session valid; now it signs out all other devices.
4. **No client-side storage.** Unchanged; production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Testing

The real routes with a stubbed database, simulating two devices: both logins got the same token and the first device stayed logged in after the second logged in; `/api/auth/me` renewed the cookie's `Max-Age`; logging out device A cleared only A's cookie and device B stayed logged in; changing the password from device B made the old token return 401 everywhere while B's new cookie worked.

## Conclusion

Fixes the repeated logouts with no schema change, at the cost of logout being per-device rather than a server-side revocation; password change and admin reset still sign out everywhere. **Cleared to publish**, with the sessions-table upgrade recommended later.
