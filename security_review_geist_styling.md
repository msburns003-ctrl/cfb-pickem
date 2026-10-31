# Pre-Publish Security Review — Geist Styling Refresh

**Scope:** Branch `claude/geist-styling`, a visual restyle in the spirit of the Next.js / Vercel "Geist" look. Files touched: `client/src/index.css` (color and font variables), `tailwind.config.ts` (corner radius), `client/index.html` (font links, theme color), `client/public/manifest.webmanifest` (theme and splash color), `client/src/components/AppShell.tsx` (header and bottom nav background). No server, schema, auth, routing or dependency changes. The app is not moved to Next.js; only the visual style is borrowed.

## What changed

- **Fonts:** body text and headings use Geist, and monospace text uses Geist Mono (both were already loaded but unused). Inter and General Sans are no longer used.
- **Font loading trimmed:** the Google Fonts link went from about 25 font families to just Geist and Geist Mono, and the Fontshare (General Sans) stylesheet was removed. Pages make fewer third-party requests and download less.
- **Palette:** neutral white (light mode) and pure black (dark mode) backgrounds, grey text and thin grey borders replace the cream/navy palette. The league red stays as the primary color, and the gold accent is unchanged. The dark-mode red was darkened slightly so white button text keeps enough contrast.
- **Header, bottom nav and login backdrop** are near-black in both modes, slightly translucent with a background blur. They stay dark so the iPhone home-screen app's white status-bar text (`black-translucent`) stays readable.
- **Corners** are slightly tighter (8px).
- **Browser/home-screen theme color** changed from navy `#19212e` to `#0a0a0a`.

## Findings

1. **Third-party requests reduced.** The only external stylesheet left is Google Fonts (`fonts.googleapis.com`, already used). The Fontshare origin (`api.fontshare.com`) is no longer contacted. No new origins added.
2. **Storage rule respected.** No `localStorage`, `sessionStorage` or `indexedDB`; the production bundle was checked and contains none of them. The theme cookie and the pre-paint script are unchanged.
3. **No logic changes.** Only CSS variables, Tailwind classes, a font URL and color values changed. No user input, API calls, cookies or auth flows are touched.
4. **`API_BASE` placeholder** untouched.

## Testing

`npm run check` passes, `npm test` passes (63 tests), `npm run build` succeeds. The production build was served locally and checked at phone width in light and dark mode with Playwright: the login page, and the logged-in header, bottom nav and dashboard empty state (with `/api/**` mocked). Pages with real data (picks, grid, standings, stats, admin) were not checked against live data and should get a quick look after publishing.

## Conclusion

A presentation-only change that also removes one third-party font origin. **Cleared to publish.**
