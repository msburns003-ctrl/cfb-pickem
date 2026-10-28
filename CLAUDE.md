# CFB Pick'em — Guide for Claude Code

This is the 2026 college football pick'em league app. Live site: https://cfb-pickem.pplx.app

Read this file before making changes. The "Rules that must not break" section lists product and security decisions the league has already settled.

Then read [`docs/PROJECT_NOTES.md`](docs/PROJECT_NOTES.md): current status, open items waiting on the commissioner, things not yet verified live, past decisions and trade-offs, and the backlog. Keep it up to date when you finish work.

## Stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, shadcn/ui (Radix) components, TanStack Query, wouter routing. Source in `client/src/`.
- **Backend:** Express (TypeScript, run with `tsx`). Source in `server/`.
- **Shared types:** `shared/schema.ts` (Zod schemas + TypeScript types used by both sides).
- **Database:** Supabase Postgres, accessed only from the server through `@supabase/supabase-js` (`server/supabase.ts`, `server/storage.ts`). There is no ORM and no Supabase Realtime.
- **Hosting:** Perplexity `pplx.app` (static frontend + proxied Express backend) with Supabase as the database.

## Running locally

```bash
npm install
cp .env.example .env   # then fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev            # Express + Vite dev server on http://localhost:5000
npm run check          # TypeScript type check (must pass before committing)
npm test               # Vitest tests (must pass before committing; CI runs them on every PR)
npm run build          # production build into dist/
```

Environment variables (`.env`, never committed):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key used by the server |
| `PORT` | Optional, defaults to 5000 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional. Outgoing email for "forgot password" (e.g. Gmail with an app password). |
| `APP_URL` | Optional. The site's public `https://` address, used in reset links. |
| `RESET_TOKEN_SECRET` | Optional. 32+ random characters that sign reset links. "Forgot password" stays off unless this, `APP_URL` and the SMTP settings are all set. |
| `AUTO_GRADE` | Optional. Automatic scoring is on in production and off in local dev; set `on` or `off` to override. Leave it off locally unless you mean to write to the production database. |

Note: the session cookie uses the `__Host-` prefix and is always `Secure`, so a browser over plain `http://localhost` will not store it. Test logged-in flows against the deployed HTTPS site, or with `curl` using a cookie jar.

**Local dev talks to the real production database.** There is no separate staging database. Be careful with anything that writes data (grading, imports, seeding, deleting).

## Project layout

```
client/src/
  App.tsx               routes
  lib/queryClient.ts    fetch wrapper; API_BASE uses the "__PORT_5000__" placeholder
  lib/auth.tsx          auth context (session lives in an httpOnly cookie only)
  lib/theme.tsx         dark mode (choice kept in the __Host-theme cookie)
  lib/projection.ts     live pick status and projected points
  lib/grid-pdf.ts       weekly grid PDF export
  pages/                dashboard, grid, standings, stats, cristoball, profile, login
client/public/          app icons, favicon, web app manifest (home-screen install; no service worker)
  pages/admin/          weeks, week-detail, members, cristoball admin
server/
  index.ts              Express entry
  routes.ts             all /api routes (public + /api/admin/*)
  auth.ts               password hashing (scrypt), session cookie, temp passwords
  password-reset.ts     signed, single-use "forgot password" links (no DB table)
  rate-limit.ts         login lockout per account; per-member request limits (in memory)
  mailer.ts             outgoing email over SMTP
  scoring.ts            grading, ATS logic, upset points, standings
  scores.ts             fetches live and final scores from the ESPN public scoreboard
  auto-grade.ts         background job: saves final scores, grades, and sets up the next week
  schedule.ts           imports a week's games and lines from ESPN; creates the next week
  teams.ts              team logos and abbreviations from ESPN's teams list (in memory, no DB)
  storage.ts            all Supabase reads/writes
  cache.ts              in-memory response caching
shared/schema.ts        types and Zod validation shared by client and server
script/build.ts         production build
script/seed.ts          one-time admin seed (generates a random temp password)
supabase_migration.sql  database schema
add_members.py          bulk member add (prompts for admin credentials)
security_review_*.md    past security reviews
tests/                  Vitest tests (in-memory stand-in for Supabase in tests/fake-storage.ts)
.github/workflows/ci.yml type check, tests and build on every pull request
```

Main tables: `users`, `weeks`, `games`, `picks`, `upset_picks`, plus the Cristo-Ball tables. See `supabase_migration.sql`.

## Rules that must not break

League rules (already decided, do not change without the commissioner's approval):

- A game is picked **against the spread (ATS)** when `abs(spread) > 5.5`, otherwise **straight up (SU)**. See `ATS_THRESHOLD` in `server/scoring.ts`.
- **Money games** are worth 2 points. How many there are each week (`moneyGameCount`) varies by week.
- **One upset pick per member per week**, scored by `upsetPickPoints(spread)`: spread ≥ 15 → 3 pts, ≥ 7.5 → 2 pts, ≥ 0.5 → 1 pt.
- **Tied members share the same rank** in standings (no tiebreaker). A tie for a weekly win shows as a PUSH.
- Games are auto-populated each week from ESPN (FBS games with betting lines, `server/schedule.ts`): when the latest week is fully graded, the background job creates the next week in `setup` and imports its games; admins can also click **Import from ESPN** on a week. The admin chooses the slate by toggling `isSelected` and opens the week. Lines are only refreshed on games nobody has picked yet.
- Grading runs through the app's own grading code (`gradeCompletedGames` in `server/scoring.ts`). It runs automatically: every 5 minutes `server/auto-grade.ts` saves final scores from ESPN and grades once the week's picks are locked. Admins can still check and grade manually (`POST /api/admin/weeks/:id/check-games` and `/grade`), and hand-entered scores are never overwritten.
- Members log in with email and password.

Security rules:

- **No `localStorage`, `sessionStorage`, or `indexedDB` anywhere in the client bundle.** The session lives in an httpOnly cookie only. Small per-device preferences (like the theme) use a `__Host-` cookie instead. No service worker or Cache Storage.
- **Cookie names must use the `__Host-` prefix** (`Secure`, `Path=/`, no `Domain`). The pplx.app proxy drops any other cookie name.
- **Never commit secrets**: no passwords, API keys, Supabase keys, or member credential files. `.env`, `*.db` files, and `league_members_temp_passwords.csv` are git-ignored; keep it that way.
- Passwords are hashed with scrypt in `salt:hash` format (`server/auth.ts`). Never log or return password hashes or session tokens.
- Rate limits are keyed by account, never by IP (`server/rate-limit.ts`): the host's proxy hides client IPs and members often share a network. Login is locked per account after 5 failures in 15 minutes; authenticated requests are capped per member inside `requireAuth`.
- Every `/api/admin/*` route must require an admin session. Validate request bodies with Zod.
- The frontend calls the API through `API_BASE` in `client/src/lib/queryClient.ts`. Keep the `"__PORT_5000__"` placeholder exactly as is; the deploy step rewrites it. Don't hard-code hostnames.

## How changes get deployed

**Pushing to GitHub does not update the live site.** The live site is published from Perplexity Computer, which builds from this repo.

Workflow:

1. Make changes on a branch or on `main`, run `npm run check` (and `npm run build`), then commit and push to GitHub.
2. Every code or feature change needs a short **security review** document before it is published (see the `security_review_*.md` files for the format). Data-only work like game imports, picks, password resets and grading doesn't need one.
3. In Perplexity, ask Computer to **pull the latest code from GitHub** and publish. It will build, review, and ask before publishing. It never auto-publishes.

To keep the two copies in sync, always push your Claude Code work to GitHub before asking Perplexity to make further changes.

## Coding conventions

- TypeScript everywhere; `npm run check` must pass with zero errors.
- `npm test` must pass. Add or update tests when changing league rules, scoring, grading, imports or auth; tests never touch Supabase or ESPN.
- Keep all database access inside `server/storage.ts`; routes call storage methods.
- Reuse existing shadcn/ui components in `client/src/components/ui/` rather than adding new UI libraries.
- Times are stored in UTC and displayed in Eastern Time.
- Keep commits small, with clear messages describing the user-visible change.
