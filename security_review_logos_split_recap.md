# Pre-Publish Security Review — Team Logos, League Split, Weekly Recap

**Scope:** Branch `claude/epic-bohr-tjyw9y`. Files touched: `server/teams.ts` (new), `server/routes.ts`, `server/cache.ts`, `server/scores.ts` (exported two existing helpers), `shared/schema.ts` (types), `client/src/components/TeamLogo.tsx` (new), `client/src/components/WeekRecap.tsx` (new), `client/src/hooks/use-team-info.ts` (new), `client/src/components/GameCard.tsx`, `client/src/components/GridByGame.tsx`, `client/src/pages/grid.tsx`, `client/src/pages/dashboard.tsx`, `CLAUDE.md`. No database schema change, no new dependencies, no auth changes.

## What changed

- **Team logos.** The server loads ESPN's public college football teams list (FBS plus the default list) into memory, refreshed daily (retried every 15 minutes after a failure), and matches our team names with the existing score matcher (exact names first). New `GET /api/weeks/:id/teams` (`requireAuth`, positive-integer id, cached 10 minutes per week) returns `{ logo, logoDark, abbreviation }` per team name. The client shows logos above team names on game cards (on a white circle for the picked team), beside names in the phone grid, and as logo + abbreviation in the desktop grid's headers and cells. Nothing is stored in the database.
- **League split ("how you compare").** New `GET /api/weeks/:id/consensus` (`requireAuth`, cached 30s) returns pick counts per side for **selected games that have already kicked off**. Game cards show e.g. "You're with 70% of the league" or "Only 3 others took Florida".
- **Weekly recap.** When the latest visible week is fully graded, the picks page leads with a recap (your points and rank that week, season rank move, weekly winner or PUSH, best upset), built from the existing `/api/stats` and `/api/weeks/:id/grid` responses. The picks page now defaults to the latest week members can see instead of a hidden Setup week. Pick buttons also report their selected state to screen readers (`aria-pressed`).

## Findings

1. **No early reveal of picks.** The split only covers games past kickoff, when those picks can no longer change; other games' picks stay hidden until the grid unlocks as before. Only counts are returned, never who picked what. The recap uses data members can already see once a week is graded.
2. **Third-party images.** Logo images load in members' browsers from ESPN's CDN. The server only passes through `https` URLs on `espncdn.com` (anything else from the feed is dropped; tested with a foreign domain and a `javascript:` URL, both rejected). Images use `referrerPolicy="no-referrer"` so ESPN doesn't see which page they're on, `alt=""` (decorative; the name is beside them), and hide themselves if they fail to load. This does let ESPN see members' IP addresses when images load, the same as any embedded image; acceptable for public team logos.
3. **Untrusted upstream data.** Abbreviations are truncated to 6 characters and rendered as React text. ESPN fetches time out after 10s; failures leave names showing without logos.
4. **Load.** One ESPN teams fetch per day per server; per-week results cached.
5. **No client-side storage.** Production bundle verified free of `localStorage`, `sessionStorage` and `indexedDB`.

## Testing

Server, against stubbed ESPN and database data: "Miami"/"Miami (OH)" and "Ohio"/"Ohio State" matched to the right teams; non-ESPN logo URLs rejected; the teams list fetched once and reused; the split endpoint returned only the selected game that had kicked off, with correct counts, and 401 without a session. UI, against the production build with mocked API data and stand-in logo images at a 375px phone width (light and dark) and desktop: logos above names without overflow; split lines with correct percentages; recap shown for a graded week while the next week sits in Setup, with the PUSH and rank move correct; desktop grid showing logo + abbreviation.

## Conclusion

Two read-only authenticated endpoints (public team metadata; post-kickoff pick counts) and display changes, with logo URLs restricted to ESPN's CDN. **Cleared to publish.**
