# Pre-Publish Security Review — Native Underdog Picker

**Scope:** Branch `claude/epic-bohr-tjyw9y`. Files touched: `client/src/components/UpsetPickPanel.tsx`. Client-only; no server, schema, auth or dependency changes.

## What changed

The underdog bonus pick dropdown was a custom Radix `Select`; members reported it wouldn't scroll on their phones (with ESPN auto-import, a week can list 40+ non-slate games). It is now a native `<select>`, so phones use their own picker (the iOS wheel, the Android list). Games are sorted by kickoff and grouped by day (`<optgroup>`), the field is 16px on phones (iOS zooms smaller form fields), and a line under it spells out the chosen underdog, spread and points, since the picker's label can be cut off on narrow screens.

## Findings

1. **Same data, same request.** The options come from the existing dashboard response; submitting still sends `{ gameId }` to `POST /api/weeks/:id/upset-pick`, which keeps its server-side checks (game in the week, not on the slate, not kicked off, week open). Already-started games are still left out of the list.
2. **No injection risk.** Team names render as React text inside `<option>`s.
3. **No client-side storage.** Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Testing

Against the production build with 40 open games plus one already kicked off, at iPhone size and on desktop in dark mode: 40 options grouped by day; the started game excluded; Lock In enabled once a game is chosen; submitting posted the chosen `gameId`. Real iPhone Safari wasn't available in the dev environment; the native control is what Safari uses for any `<select>`. Full test suite: 63 passing.

## Conclusion

A native form control in place of a custom one; no new data or endpoints. **Cleared to publish.**
