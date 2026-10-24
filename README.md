# CFB Pick'em

The 2026 college football pick'em league app. Members log in, pick each week's slate of games, make one upset pick, and follow the standings all season.

**Live site:** https://cfb-pickem.pplx.app

## Features

- **Weekly picks:** pick every selected game. Games lock at kickoff.
- **Upset pick:** one underdog pick per member per week, worth bonus points.
- **Money games:** a few games each week count double.
- **Grid:** see everyone's picks for the week, with a PDF export.
- **Standings:** weekly and season totals.
- **Cristo-Ball:** season-long preseason predictions.
- **Live scores:** in-progress scores on game cards and the grid, with whether your pick is winning or covering.
- **Automatic scoring:** final scores are pulled from ESPN and graded every 5 minutes once picks lock. No manual step needed.
- **Admin tools:** manage weeks and the game slate, enter or correct scores, manage members and reset passwords.

## League rules

| Rule | Detail |
|---|---|
| ATS vs. straight up | A game is picked against the spread when `abs(spread) > 5.5`; otherwise straight up. |
| Regular game | 1 point |
| Money game | 2 points (the number of money games varies by week) |
| Upset pick | Spread ≥ 15: 3 pts · ≥ 7.5: 2 pts · ≥ 0.5: 1 pt |
| Ties | Tied members share the same rank. A tie for a weekly win is a PUSH. |

Scoring lives in `server/scoring.ts`. Rule changes need the commissioner's approval.

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
| `npm run build` | Production build into `dist/` |
| `npm start` | Run the production build |

> **Heads up:** local dev uses the real production database. Be careful with anything that writes data (grading, imports, seeding, deleting).
>
> The session cookie is `Secure` with a `__Host-` prefix, so logging in over plain `http://localhost` won't work in a browser. Test logged-in flows on the live HTTPS site or with `curl` and a cookie jar.

## Project layout

```
client/src/        React app (pages, components, auth, API client)
server/            Express API, auth, scoring, ESPN score fetching, Supabase storage
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

- Sessions live in an httpOnly `__Host-` cookie. No browser storage is used.
- Passwords are hashed with scrypt.
- All `/api/admin/*` routes require an admin session.
- Never commit secrets. `.env` and member credential files are git-ignored.

See [`CLAUDE.md`](CLAUDE.md) for the full contributor guide.
