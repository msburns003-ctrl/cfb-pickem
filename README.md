# CFB Pick'em

The 2026 college football pick'em league app. Members log in, pick each week's slate of games, make one upset pick, and follow the standings all season.

**Live site:** https://cfb-pickem.pplx.app

## Features

- **Weekly picks:** pick every selected game. Games lock at kickoff. A "Your week so far" card shows your record, live pick status, points (official and projected) and season rank.
- **Upset pick:** one underdog pick per member per week, worth bonus points.
- **Money games:** a few games each week count double.
- **Grid:** see everyone's picks for the week, with a PDF export. On phones it shows one card per game with who picked each side; while games are live it adds projected points and a live leaderboard.
- **Standings:** weekly and season totals.
- **Cristo-Ball:** season-long preseason predictions.
- **Live scores:** in-progress scores on game cards and the grid, with whether your pick is winning or covering.
- **Automatic scoring:** final scores are pulled from ESPN and graded every 5 minutes once picks lock. No manual step needed.
- **Automatic weekly setup:** once a week is graded, the next week is created with ESPN's games and betting lines, ready for the admin to pick the slate.
- **Season stats:** pick records, weekly wins, streaks and a points-by-week chart for every member, plus league leaders.
- **Phone-friendly:** a bottom tab bar on phones, and the site can be added to the home screen as an app (Profile → Get the app).
- **Dark mode:** Match device, Light or Dark from the sun/moon button in the header.
- **Forgot password:** members can reset their own password from an emailed link (needs email settings; see below). Otherwise the commissioner resets it.
- **Admin tools:** manage weeks and the game slate, import games and lines from ESPN, enter or correct scores, manage members and reset passwords.

## League rules

| Rule | Detail |
|---|---|
| ATS vs. straight up | A game is picked against the spread when `abs(spread) > 5.5`; otherwise straight up. |
| Regular game | 1 point |
| Money game | 2 points (the number of money games varies by week) |
| Upset pick | Spread ≥ 15: 3 pts · ≥ 7.5: 2 pts · ≥ 0.5: 1 pt |
| Ties | Tied members share the same rank. A tie for a weekly win is a PUSH. |

Scoring lives in `server/scoring.ts` (shared win/cover logic in `shared/outcome.ts`). Rule changes need the commissioner's approval.

## Weekly admin routine

1. When a week is fully graded, the next week appears in **Admin** within a few minutes, in **Setup** (hidden from members) with ESPN's games and lines loaded.
2. Check the spreads. **Import from ESPN** refreshes lines on games nobody has picked yet and lists any game with no line; use **Add Game** for anything missing.
3. Toggle on the slate, set the money game count, and set the week to **Open**.
4. Scores and grading are automatic once games finish. **Check Games** and **Grade** still work as a manual override, and hand-entered scores are never overwritten.

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, wouter
- **Backend:** Express (TypeScript, run with `tsx`)
- **Database:** Supabase Postgres, accessed only from the server
- **Scores:** ESPN public scoreboard
- **Hosting:** Perplexity `pplx.app`

## Getting started

Requires Node.js and npm.

```bash
npm install
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev            # http://localhost:5000
```

| Script | What it does |
|---|---|
| `npm run dev` | Express + Vite dev server |
| `npm run check` | TypeScript type check (must pass before committing) |
| `npm test` | Automated tests (must pass; also run on every pull request) |
| `npm run build` | Production build into `dist/` |
| `npm start` | Run the production build |

Optional: `AUTO_GRADE=on|off` in `.env`. Automatic scoring and next-week setup run in production and are off in local dev by default; leave them off locally unless you mean to write to the production database.

### Turning on "forgot password"

Set these on the host (see `.env.example`): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `APP_URL` and `RESET_TOKEN_SECRET`. With Gmail: turn on 2-step verification, create an app password (Google Account → Security → App passwords), and use `smtp.gmail.com`, port `587`, your Gmail address and the app password. Until all are set, the login page tells members to ask the commissioner.

> **Heads up:** local dev uses the real production database. Be careful with anything that writes data (grading, imports, seeding, deleting).
>
> The session cookie is `Secure` with a `__Host-` prefix, so logging in over plain `http://localhost` won't work in a browser. Test logged-in flows on the live HTTPS site or with `curl` and a cookie jar.

## Project layout

```
client/src/        React app (pages, components, auth, theme, API client)
client/public/     app icons, favicon and web app manifest
server/            Express API, auth, scoring, Supabase storage
  scores.ts        live and final scores from ESPN
  auto-grade.ts    background job: saves scores, grades, sets up the next week
  schedule.ts      imports a week's games and lines from ESPN
shared/schema.ts   Zod schemas and types shared by client and server
script/            build and one-time admin seed
supabase_migration.sql   database schema
```

## Deployment

Pushing to GitHub does **not** update the live site. The site is published from Perplexity Computer:

1. Run `npm run check` and `npm run build`, then commit and push.
2. Add a short security review (`security_review_*.md`) for any code or feature change.
3. In Perplexity, ask Computer to pull the latest code from GitHub and publish.

## Security

- Sessions live in an httpOnly `__Host-` cookie. No browser storage is used (`localStorage`, `sessionStorage`, `indexedDB`); the theme choice is a separate `__Host-theme` cookie. No service worker.
- Passwords are hashed with scrypt.
- All `/api/admin/*` routes require an admin session.
- Never commit secrets. `.env` and member credential files are git-ignored.

See [`CLAUDE.md`](CLAUDE.md) for the full contributor guide.
