# Pre-Publish Security Review — Remove Hard-Coded Password and Add Claude Code Guide

**Scope:** Changes on `main` before commit. Files touched: `add_members.py`, `script/seed.ts`, `CLAUDE.md` (new), `.env.example` (new), and this review (new). No files under `client/`, `server/` or `shared/` changed, so the built site bundle is the same and the live site does not need to be republished.

## What changed

- **`add_members.py`:** Removed the hard-coded admin email and password. The script now reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment, or prompts for them (the password uses `getpass`, so it isn't echoed). The base URL can be overridden with `BASE_URL` and still defaults to `http://localhost:5000`. The admin-skip check now compares against `ADMIN_EMAIL` instead of a hard-coded address.
- **`script/seed.ts`:** Removed the hard-coded temporary password. The script now calls the existing `generateTempPassword()` from `server/auth.ts`, so each run gets a random one-time password. It still only creates the admin if one doesn't exist.
- **`CLAUDE.md` (new):** A guide for Claude Code covering the stack, local setup, project layout, the league's scoring rules, security rules (no browser storage, `__Host-` cookies, no committed secrets, admin-gated routes) and how deploys work. It contains no credentials, keys, tokens or member data.
- **`.env.example` (new):** A blank template listing `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `PORT`, with no values filled in. `.gitignore` already ignores `.env` and `.env.*` but keeps `.env.example` (`!.env.example`).

## Findings

1. **Hard-coded credential removed from the current code.** `git grep` across tracked files no longer finds the old password. The only remaining match for the word "gridiron" is the word list `generateTempPassword()` draws from in `server/auth.ts`, which isn't a credential.
2. **Old password is still in the git history.** Earlier commits still contain the old password. It was already invalid for the admin account, because that account's password was reset and must be changed on login. History was not rewritten: force-pushing a rewritten history is destructive, and the credential no longer works. Recommendation: don't reuse that password anywhere.
3. **No new secrets added.** I checked `CLAUDE.md` and `.env.example`; neither contains keys, tokens, passwords or member emails.
4. **No runtime or attack-surface change.** No routes, auth, cookies, schema or client code changed. Both scripts are operator-only tools that are never bundled or deployed.
5. **Type check passes.** `npx tsc --noEmit` reports 0 errors after the `seed.ts` change. `python3 -m py_compile add_members.py` succeeds.
6. **Guide reinforces existing controls.** `CLAUDE.md` documents the no-`localStorage`/`sessionStorage`/`indexedDB` rule, the `__Host-` cookie requirement, admin gating, and the rule that every code change needs a security review before publishing.

## Conclusion

This change removes a hard-coded credential and adds documentation only. It adds no new endpoints, data exposure or client-side storage, and nothing on the live site changes. **Cleared to commit and push.** No site republish is needed.
