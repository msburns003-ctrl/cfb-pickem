# Pre-Publish Security Review — cfb-pickem
**Scope:** "Group text update" card on the admin week page (client/src/components/ShareUpdateCard.tsx, client/src/lib/share-update.ts, client/src/pages/admin/week-detail.tsx, server/routes.ts). Builds a plain-text standings update (top 10 for the week and season) or a picks reminder that the commissioner reviews, then shares via the device share sheet or copies to the clipboard.

## Security Review Results

### BLOCK (must fix before publishing)
None.

### WARN (inform user, let them decide)
- **Pre-existing dependency advisories** — unchanged from `security_review_pick_save_fixes.md` (`body-parser`, `dompurify`, `postcss-selector-parser`). No dependencies added or changed here.

### PASS
- **No new endpoints** — The card reads existing routes only: `GET /api/weeks/:id/grid` (already refuses before picks lock), `GET /api/standings`, and `GET /api/admin/weeks/:id` (already `requireAdmin`). The card is only rendered on the admin week page.
- **No early pick reveal** — The standings update only uses the grid, which the server withholds until the week locks, and the button is disabled before then. The pre-lock reminder only lists names and pick counts, never which teams anyone chose.
- **Server change** — `GET /api/admin/weeks/:id` `pickProgress` now also returns each member's `hiddenFromGrid` flag (admin-only route) so booted members aren't included in reminders. No email, password hash, or session data added.
- **Client** — Text is rendered in a `<Textarea>` value (no HTML injection). Sharing uses `navigator.share` / `navigator.clipboard`; no `localStorage`/`sessionStorage`/`indexedDB`. Site link comes from `window.location`, not a hard-coded hostname. `API_BASE` placeholder untouched.
- **Secrets / logging** — None added.

## Fixes Applied
None required — no BLOCK findings.

## Conclusion
Clean. Admin-only, read-only feature built on existing endpoints. Safe to publish.
