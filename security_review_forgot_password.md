# Pre-Publish Security Review — Forgot Password

**Scope:** Branch `claude/epic-bohr-tjyw9y`. Files touched: `server/password-reset.ts` (new), `server/mailer.ts` (new), `server/routes.ts`, `client/src/pages/password-reset.tsx` (new), `client/src/pages/login.tsx`, `client/src/App.tsx`, `package.json` (`nodemailer` dependency, `@types/nodemailer` dev dependency), `.env.example`, `CLAUDE.md`, `README.md`, `tests/password-reset.test.ts`. No database schema change.

## What changed

- **"Forgot password?"** on the login page. A member enters their email; if it belongs to a member, they get an email with a link that opens a "choose a new password" page. Saving it signs out every other device and logs this one in.
- **Off by default.** It only turns on when `RESET_TOKEN_SECRET` (32+ chars), `APP_URL` (an `https` origin) and SMTP settings are all set; otherwise the page says to ask the commissioner and the API returns `503`.
- New public routes: `GET /api/auth/config` (whether reset is on), `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`. Bodies validated with Zod.

## Findings

1. **No stored reset tokens, single use.** A link is `userId.expiresAt.signature`, where the signature is HMAC-SHA256 with `RESET_TOKEN_SECRET` over the id, expiry and the member's **current password hash**. It expires after 1 hour and becomes invalid as soon as the password changes (tested: reusing a link fails). Tokens are strictly format-checked and compared in constant time; a changed id or expiry fails (tested).
2. **No account discovery.** `forgot-password` returns the same response whether or not the email is a member's, and sends the email in the background so response time doesn't differ (tested: same body for member and stranger; only the member gets mail).
3. **Abuse limits.** At most 3 reset emails per address per 15 minutes (tested), plus a loose per-IP cap (behind the host's proxy many members may share an IP). Links come from `APP_URL`, never from the request's `Host` header, so a forged host can't point the link elsewhere.
4. **Sessions.** A successful reset sets a new session token (old sessions on every device stop working; tested) and a new `__Host-` httpOnly cookie for this device. Responses never include password hashes or tokens (tested).
5. **Token in the URL.** The link puts the token in the URL fragment (`/#/reset-password/<token>`), which browsers don't send to servers or in `Referer` headers. It may remain in browser history; it's short-lived and single-use. Tokens are never logged; email failures log only the error message.
6. **Email content.** The member's name is HTML-escaped in the email; the link is built from fixed parts.
7. **Secrets.** SMTP credentials and the signing secret live only in host environment settings; `.env.example` holds blank placeholders. If the secret leaks, rotating it invalidates every outstanding link.
8. **Dependency.** `nodemailer` (widely used, MIT, no dependencies of its own) is bundled into the server build; nothing is added to the browser bundle. Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Conclusion

Self-service reset with signed, expiring, single-use links, no account discovery, rate limits and full session rotation; disabled until the commissioner configures email. **Cleared to publish.**
