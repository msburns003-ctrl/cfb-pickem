# Pre-Publish Security Review — Home-Screen App Banner

**Scope:** Branch `claude/epic-bohr-tjyw9y` — a temporary banner on the picks page with instructions for adding Pick'em to the home screen. Files touched: `client/src/components/InstallAppCard.tsx`, `client/src/pages/dashboard.tsx`. Client-only; no server, schema, auth or dependency changes.

## What changed

- The install instructions from the Profile "Get the app" card are shared with a new banner at the top of the picks page: an Install button where the browser supports it, Share → Add to Home Screen steps on iPhone/iPad, generic steps elsewhere.
- The banner shows until a fixed time in the code (`INSTALL_BANNER_UNTIL`, Sunday Oct 25, 2026, 6 PM ET), never when the site is already opened as an app, and can be closed for the visit.

## Findings

1. **No storage.** Closing the banner is in-memory React state only, so it comes back on the next visit until the end time. Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.
2. **No data or requests.** The banner uses no API data and makes no requests.
3. **No injection risk.** Static text only.

## Conclusion

A static, time-limited client-side notice. **Cleared to publish.**
