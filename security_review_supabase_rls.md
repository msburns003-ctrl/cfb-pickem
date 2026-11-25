# Pre-Publish Security Review — Supabase secret key and row level security

**Scope:** Server database access moves from the public anon key to a server-only secret key, and `supabase_rls_lockdown.sql` is added for the commissioner to run by hand after that key is live. Files touched: `server/supabase-key.ts` (new), `server/supabase.ts`, `tests/supabase-key.test.ts` (new), `.env.example`, `supabase_rls_lockdown.sql` (new), `supabase_migration.sql` (comments only; the `DISABLE ROW LEVEL SECURITY` statements are removed so re-running the old file cannot undo the lockdown), `CLAUDE.md`, `README.md`, `docs/PROJECT_NOTES.md`. No new dependencies. The SQL file was not run. The live database was not modified.

## What changed

- **Secret key.** `server/supabase.ts` reads `SUPABASE_SERVICE_ROLE_KEY` and passes it only to `createClient` on the server. Accepted values are a new secret key (`sb_secret_...`) or a legacy JWT whose `role` claim is `service_role`. Both bypass row level security (`service_role` has `BYPASSRLS`). The browser never creates a Supabase client. `add_members.py` and the React app only call `/api/...`.
- **Temporary anon fallback.** If the secret key is missing, blank, a public key (anon JWT or `sb_publishable_...`), or not a recognized secret, the server keeps using `SUPABASE_ANON_KEY` and logs `still using the public anon key`. The log repeats every 15 minutes and does not include the key. Publishing before the host variable is set does not take the site down. The fallback is temporary: `supabase_rls_lockdown.sql` must not be run until the log line has stopped. If neither key is usable, the first database call throws and the error text does not contain key material.
- **New secret keys are not sent as Bearer tokens.** `sb_secret_...` is not a JWT. supabase-js would put it on `Authorization`, and PostgREST rejects that with `Expected 3 parts in JWT`. For those keys the server deletes that header and leaves the key on `apikey` only. Legacy `service_role` JWTs keep the normal `Authorization` header, which PostgREST requires.
- **No user session on the server client.** `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` are off. A user JWT on this client would replace the secret key, and with no policies row level security would hide every row from the server.
- **Lockdown script, not applied.** Enables RLS on all 7 public tables and creates no policies. Revokes `EXECUTE` on `public.rls_auto_enable()` from `PUBLIC`, `anon`, and `authenticated` (the function ACL grants execute to `PUBLIC`, so revoking only `anon` and `authenticated` would leave them able to call it). Grants execute back to `dashboard_user` only, so the table editor can still fire the `ensure_rls` event trigger. `postgres` and `service_role` already have their own grants. Also revokes anon/authenticated table and sequence privileges. `service_role` grants are left in place. Future tables created by the role that runs the script are not auto-granted to anon or authenticated.

## What was checked and does not need a code change

- Storage uses `.from()` only. No `.rpc()`, Auth admin, Storage, or Realtime subscriptions. No views in `public`. The only exposed `SECURITY DEFINER` function is `rls_auto_enable()`, and the app does not call it.
- `service_role` already has full privileges on the 7 tables and their id sequences, and `BYPASSRLS`. Enabling RLS with zero policies blocks anon and authenticated. Revoking their grants does not affect the server or the SQL editor (`postgres` also has `BYPASSRLS`).
- Request logging in `server/index.ts` logs API JSON responses, not Supabase request headers.

## Findings

1. **The secret key bypasses RLS.** That is required, because the server is the only authorization layer. It must never be committed, logged, or shipped to the browser. Tests cover that warnings and thrown errors omit the key. The production client bundle was checked for `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`, and `service_role` (see Testing).
2. **The anon fallback is a window, not a permanent design.** Until the SQL is run, anyone with the anon key can still read and write every row, which is the current production behavior. The repeating error is the signal that the window is still open. Running the SQL first blanks the site.
3. **A pasted public key is not treated as the secret.** Otherwise the commissioner could run the SQL believing the server had switched, and the site would go down. The bad value is ignored and the anon fallback stays in place.
4. **`rls_auto_enable` is not left executable by anon.** Revoking `PUBLIC` is required for the revoke to actually stick. `dashboard_user` is not an API role.
5. **No client storage, no new cookies, no new admin routes.**

## Testing

`tests/supabase-key.test.ts` (11 tests): secret key and legacy service_role JWT are selected; quotes and whitespace are stripped; missing, public, and unrecognized values fall back without the key appearing in the warning; a wrong key with no anon fallback throws without the key in the message; `sb_secret_` fetch drops `Authorization` and keeps `apikey`; a different bearer token is left alone; JWT keys are not wrapped. Full suite: 85 passing. The suite does not contact Supabase or ESPN.

`npm run check` and `npm run build` passed. `dist/public` has no `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`, `sb_publishable_`, or `service_role`. The server bundle names `SUPABASE_SERVICE_ROLE_KEY` so it can read the variable at runtime, and it contains no key value.

## Conclusion

The server can use a secret key without taking the site down if that variable is not set yet, and the SQL to turn on row level security is in the repo but not applied. **Cleared to publish. Do not run `supabase_rls_lockdown.sql` until `SUPABASE_SERVICE_ROLE_KEY` is set and the "still using the public anon key" log has stopped.**
