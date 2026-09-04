# Pre-Publish Security Review — Download Grid PDF

**Scope:** Diff on `main` (uncommitted at review time) — adds a "Download Grid PDF" button to the admin per-week page (`client/src/pages/admin/week-detail.tsx`) and a new client-only helper (`client/src/lib/grid-pdf.ts`) that renders the picks grid as a landscape PDF via `jspdf` + `jspdf-autotable`. Confirmed via `git diff --cached --stat` that the only files touched are: `client/src/pages/admin/week-detail.tsx`, `client/src/lib/grid-pdf.ts` (new), `package.json`, `package-lock.json` (new deps). No server route, schema, auth, or config files were changed.

## What changed

- New button on `/admin/weeks/:id`, disabled until the week's grid is unlocked (mirrors the server's own `locked` gate).
- On click, fetches `GET /api/weeks/:id/grid` — an **existing** endpoint, already used by the member-facing `grid.tsx` page, gated by `requireAuth` (any logged-in member or admin can already call it).
- Builds a PDF entirely in the browser from the JSON response and triggers a local file download (`doc.save(...)`). Nothing is uploaded or sent anywhere.
- `jspdf`/`jspdf-autotable` are dynamically `import()`-ed only when the button is clicked, so the ~420KB library is not part of the initial bundle for any user (verified in build output: main chunk dropped from 931KB to 508KB after code-splitting, with `grid-pdf` as its own lazy chunk).

## Findings

1. **No new backend surface.** No new route, no new SQL, no schema change. The client reuses the same authenticated GET already reachable from `grid.tsx`, so there is no new data exposure — an admin viewing `/admin/weeks/:id` already has access to every user's picks via the existing `pickProgress`/games data on that page.
2. **No new client-side storage.** The PDF is generated in memory and handed to the browser's native download flow (`doc.save`) — no `localStorage`/`sessionStorage`/`indexedDB`, consistent with the project's standing rule.
3. **Third-party dependency risk.** `jspdf` (v4.2.1) and `jspdf-autotable` (v5.0.8) are widely used, actively maintained MIT-licensed libraries with no known runtime network calls — table/PDF rendering only. `npm audit` reports one pre-existing moderate advisory (`qs`, via `express`/`body-parser`, unrelated to this change and already present before this diff).
4. **No injection risk.** All table cell content comes from server-returned team names/member names/numbers already rendered as plain text elsewhere in the app; `jspdf-autotable` renders cell strings as PDF text, not HTML, so there is no XSS vector introduced.
5. **Access control preserved.** The button is only rendered on the already-admin-gated `/admin/weeks/:id` route; the underlying grid fetch still enforces the server's own lock-timing check (`403` until the week is locked), so no early-reveal of picks is possible through this path.

## Conclusion

No new backend endpoints, no new data exposure, no new auth surface, and no localStorage/sessionStorage/indexedDB usage. This is a client-only feature reusing an existing authenticated endpoint. **Cleared to publish.**
