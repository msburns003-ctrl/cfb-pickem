# Pre-Publish Security Review — Permanent Home-Screen Banner

**Scope:** Branch `claude/epic-bohr-tjyw9y`. Files touched: `client/src/components/InstallAppCard.tsx`, `client/src/lib/install.ts`, `client/src/pages/dashboard.tsx`. Client-only; no server, schema, auth or dependency changes. Follows `security_review_install_banner.md`.

## What changed

- The picks-page banner inviting members to add Pick’em to their home screen no longer expires. It shows on phone and tablet browsers only (iPhone/iPad, Android or other mobile user agents), never on desktop and never inside the installed app.
- Closing it is remembered on that device for 30 days in a `__Host-install-banner=dismissed` cookie (`Secure`, `Path=/`, no `Domain`, `SameSite=Lax`).

## Findings

1. **Storage rule respected.** No `localStorage`, `sessionStorage` or `indexedDB` (production bundle verified). The cookie follows the same pattern as the reviewed `__Host-theme` cookie: `__Host-` prefix as the proxy requires, value is the fixed string `dismissed`, read with a fixed pattern and never evaluated. It is sent to the server with requests but nothing reads it there.
2. **Device detection is cosmetic.** The user-agent check only decides whether to show a banner; spoofing it changes nothing but the banner.
3. **No data or requests.** Static text plus the existing install instructions; no API calls.

## Testing

Against the production build: shown in iPhone Safari and Android Chrome; hidden on desktop and in the installed app; closing it set the cookie (`Secure`, 30 days) and it stayed hidden after a reload. Full test suite: 63 passing.

## Conclusion

A cosmetic, dismissible notice with a non-sensitive `__Host-` preference cookie. **Cleared to publish.**
