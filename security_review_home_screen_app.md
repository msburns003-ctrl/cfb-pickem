# Pre-Publish Security Review — Add to Home Screen

**Scope:** Branch `claude/epic-bohr-tjyw9y` — makes the site installable to a phone's home screen. Files touched: `client/public/` (new: `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.png`), `client/index.html`, `client/src/main.tsx`, `client/src/lib/install.ts` (new), `client/src/components/InstallAppCard.tsx` (new), `client/src/pages/profile.tsx`, `client/src/components/AppShell.tsx`. No server, schema, auth or dependency changes.

## What changed

- **Web app manifest** (name "CFB Pick'em", short name "Pick'em", start at `/#/dashboard`, standalone display, navy theme) and icons rendered from the existing logo. `index.html` links the manifest and adds the iPhone home-screen tags (`apple-touch-icon`, `apple-mobile-web-app-*`), a `theme-color` and a page `<title>`. The `favicon.png` that `index.html` already referenced is now actually in the repo.
- In home-screen mode on iPhone the status bar overlays the page, so the header adds `env(safe-area-inset-top)` padding (zero in a normal browser tab).
- **Profile → "Get the app":** an Install button where the browser offers one (Chrome/Android `beforeinstallprompt`), Share → Add to Home Screen steps on iPhone/iPad, generic steps elsewhere. Hidden when already opened as an app.

## Findings

1. **No service worker, no offline cache.** The app stays online-only; nothing is cached, so there's no risk of serving stale pages or API data after a deploy, and no Cache Storage use. Chrome reports the site installable without one (`Page.getInstallabilityErrors` returned none).
2. **No client-side storage.** The install prompt event is held in memory only. Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.
3. **Session handling unchanged.** The home-screen app opens the same origin, so the same `__Host-` httpOnly session cookie applies. Note: on iPhone, home-screen apps keep their own cookies separate from Safari, so members log in once inside the app.
4. **Static files only.** The manifest and icons are public static assets served by the existing static handler (`application/manifest+json`); they contain no member data. `start_url`/`scope` stay on the site's own origin.
5. **No injection risk.** No user-supplied content involved.

## Conclusion

Static install metadata and a profile card, with no service worker, storage or server changes. **Cleared to publish.**
