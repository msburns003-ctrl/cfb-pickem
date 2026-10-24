# Pre-Publish Security Review — Dark Mode

**Scope:** Branch `claude/epic-bohr-tjyw9y` — adds a theme menu (Match device / Light / Dark). Files touched: `client/src/lib/theme.tsx` (new), `client/src/components/ThemeToggle.tsx` (new), `client/src/components/AppShell.tsx`, `client/src/App.tsx`, `client/index.html`, `client/src/pages/not-found.tsx` (theme colors). No server, schema, auth or dependency changes.

## What changed

- A sun/moon button in the header opens a menu: Match device (default), Light, Dark. The existing dark palette in `index.css` is applied by toggling the `dark` class on `<html>`. "Match device" follows the phone or computer setting live.
- The choice is remembered in a **`__Host-theme` cookie** (`Secure`, `Path=/`, no `Domain`, `SameSite=Lax`, one year; value `light` or `dark`; deleted when set back to Match device). A small inline script in `index.html` reads it before first paint so dark mode doesn't flash light.
- The 404 page uses theme colors instead of fixed grays.

## Findings

1. **Storage rule respected.** No `localStorage`, `sessionStorage` or `indexedDB`; production bundle verified free of all three. The preference uses a cookie, which the rules allow as long as it has the `__Host-` prefix, which it does (the pplx.app proxy drops other names).
2. **Not a session cookie.** The theme cookie is readable by page script by design and holds only `light` or `dark`. The session cookie is untouched and stays httpOnly. The cookie is sent to the server with requests but nothing reads it there.
3. **Inline script.** The pre-paint script only reads `document.cookie` and `matchMedia`, matches the value against `light|dark`, and toggles a class. It doesn't evaluate the cookie or write any markup. The app sets no Content-Security-Policy today, so no policy changes were needed.
4. **No injection risk.** No user-supplied content involved.

## Testing

In a browser at phone size: the menu opens and shows the current choice; choosing Dark applies it and sets `__Host-theme=dark` (Secure); dark mode survives a reload; choosing Match device removes the cookie and follows the device again. Picks, grid, standings and stats pages checked visually in dark mode.

## Conclusion

A client-only display preference stored in a correctly prefixed, non-sensitive cookie. **Cleared to publish.**
