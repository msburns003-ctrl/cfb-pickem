# Pre-Publish Security Review — Automated Tests and CI

**Scope:** Branch `claude/epic-bohr-tjyw9y`. Files touched: `tests/` (new), `vitest.config.ts` (new), `.github/workflows/ci.yml` (new), `package.json` / `package-lock.json` (`vitest` dev dependency, `npm test` script). No app code changes.

## What changed

- 47 Vitest tests covering the league rules (ATS threshold, money games, upset tiers, pushes, tied ranks, weekly PUSH), grading, automatic grading (including never overwriting hand-entered scores and not grading open weeks), projections, the ESPN import and next-week setup, team logo matching, sessions across devices, admin-only access, and the post-kickoff-only league split.
- A GitHub Actions workflow runs `npm ci`, `npm run check`, `npm test` and `npm run build` on every pull request and push to `main`.

## Findings

1. **No secrets, no production access.** Tests use an in-memory stand-in for Supabase (`tests/fake-storage.ts`) and stub every ESPN request; the workflow sets no secrets or environment variables and can't reach the database.
2. **Least privilege.** The workflow has `permissions: contents: read`, uses only GitHub's official `actions/checkout` and `actions/setup-node`, and doesn't run on `pull_request_target`, so pull requests can't access repository secrets or write access.
3. **Dev-only dependency.** `vitest` is a devDependency; it isn't part of the production bundle or server build (verified: build output unchanged in behavior).

## Conclusion

Test tooling and a read-only CI job; no runtime changes. **Cleared to publish.**
