# Project notes — status, decisions, open items

Living notes so a new session (or person) can pick up where the last one left off. `CLAUDE.md` holds the rules; this file holds the state. Update it when something here changes.

_Last updated: October 31, 2026._

## Status

- All work through pull request #21 is merged into `main`. **Pushing to GitHub doesn't update the live site** — it changes only when the commissioner publishes through Perplexity Computer. Check with the commissioner what has been published before assuming something is live.
- CI (`.github/workflows/ci.yml`) runs type check, 63 tests and the build on every pull request. GitHub doesn't block merges on it unless branch protection is turned on (repo Settings → Branches).

## Waiting on the commissioner

- **Publish** the latest `main` through Perplexity.
- **Forgot password** is off until these are set on the host: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `APP_URL`, `RESET_TOKEN_SECRET` (see `.env.example`; Gmail steps in the README).
- **Optional:** turn on branch protection so a failing check blocks merging.
- **Hosting decision:** moving to Render (~$7/month) or Railway (~$5/month) would deploy automatically on merge and drop the Perplexity step. The app needs an always-on server (auto-grade job, in-memory caches), so no free sleeping tiers or serverless hosts. Not started.

## Not yet verified against the live site

- **Geist styling refresh** (branch `claude/geist-styling`): checked only on the login page and an empty dashboard with mocked data. After publishing, look over picks, grid, standings, stats and admin in light and dark mode for any colors that read poorly against the new neutral palette.

ESPN is blocked from the dev environment, so these were tested only with stubbed data. Check them after the first real run:

- **Automatic next-week setup and Import from ESPN** (`server/schedule.ts`): first real run is after week 8 is fully graded. Check that week 9 appears in Setup with sensible spreads, favorites and TV.
- **Team logos** (`server/teams.ts`): if a team shows no logo, its name doesn't match ESPN's; add the spelling to `TEAM_ALIASES` in `server/scores.ts`.
- **Scoring unranked games:** score checks now request every FBS game (`groups=80`). Confirm unranked slate games grade automatically.

## Decisions and trade-offs

- **One session token per member, shared across devices** (`server/routes.ts` login). Logging in on a new device no longer logs out the others; logout is per device; changing the password (or an admin reset) signs out everywhere. Trade-off: logout doesn't revoke the token server-side. The full fix is a per-device sessions table (needs a migration).
- **Rate limits are keyed by account, never IP** (`server/rate-limit.ts`). Login locks an account after 5 failures in 15 minutes, even for the right password. Trade-off: someone who knows a member's email can keep that account locked; the member gets in via Forgot password or an admin reset. The August pull request #1 (IP-based, by Kevin Harris) was closed in favor of #20; see its comment for why.
- **No database changes** were made: logos come from ESPN's teams list in memory, reset links are signed (no table), stats are computed from graded picks.
- **Per-device preferences use `__Host-` cookies** (theme, install-banner dismissal), never browser storage.
- **Home-screen app has no service worker or offline mode** (would need on-device storage).
- **The league split ("how you compare")** is only shown for games past kickoff, so it can't influence picks.
- **Next.js look, not Next.js itself** (Oct 31): the site borrows the Geist/Vercel visual style (fonts, neutral palette, thin borders) but stays on Vite + Express. A Next.js migration would mean rewriting routing and data fetching, and it is unclear whether pplx.app can host a Next.js server. Revisit only in the off-season.
- **Header stays dark in light mode** so the iPhone home-screen status bar (`black-translucent`, white text) stays readable.
- **Grading waits for the pick deadline** because money games are assigned when picks lock.

## Testing notes

- Tests use `tests/fake-storage.ts` (in-memory Supabase stand-in) and stub `fetch`; they never touch the real database or ESPN.
- For UI checks, run the production build (`npm run build`, then `NODE_ENV=production AUTO_GRADE=off PORT=5055 node dist/index.cjs`) and drive it with Playwright, mocking `/api/**` and aborting Google Fonts/Fontshare requests (they're blocked in the dev environment and stall page load). Stop servers by PID: the app binds with `reusePort`, so leftover servers on the same port answer requests at random.
- Local dev writes to the production database. `AUTO_GRADE` is off locally by default; keep it that way.

## Backlog (ideas, not started)

- Pick reminders and a “7 of 12 picked” progress bar.
- Lock down Supabase: server uses the private service key; turn on row-level security so the anon key can't read tables.
- Per-device sessions table (revocable logout, hashed tokens).
- Admin status panel: last ESPN fetch, last auto-grade run, teams without a logo match.
- A separate test Supabase project with fake data.
- End-of-season page: champion, final standings, Cristo-Ball reveal, season archive.
- An “open the week” checklist on the admin week page.
