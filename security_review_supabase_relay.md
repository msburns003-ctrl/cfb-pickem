# Pre-Publish Security Review — Website credential relay for the Supabase secret key

**Scope:** The published app learns to use pplx.app's custom-credential relay to reach Supabase with the service role, plus an admin-only endpoint that reports which database key source is live. Files touched: `server/supabase-key.ts`, `server/supabase.ts`, `server/routes.ts`, `tests/supabase-key.test.ts`, `.env.example`, `CLAUDE.md`, `docs/PROJECT_NOTES.md`. No new dependencies. No database changes.

## Background

The commissioner saved the Supabase secret key (`sb_secret_...`) as a custom credential and attached it to the publish. The host cannot inject it as a plain `SUPABASE_SERVICE_ROLE_KEY` env var (values passed at publish time are literal strings, and the platform never exposes the secret itself to the assistant). What the host injects instead is a relay pair: `CUSTOM_CRED_<HOST>_URL` and `CUSTOM_CRED_<HOST>_PROXY_AUTH_KEY`. Requests sent to the relay URL with the proxy token as `x-api-key` are forwarded to Supabase with the real secret key attached upstream.

This was verified live before writing code: the relay was exercised with the app's exact header pattern (anon `apikey` + anon `Authorization`) and returned rows from a table with row level security enabled and no policies — i.e. service-role access — while the same headers directly against Supabase returned none.

## What changed

- **Resolution order** (`resolveSupabaseConnection` in `server/supabase-key.ts`): a valid `SUPABASE_SERVICE_ROLE_KEY` still wins; next the relay pair; only then the existing anon fallback. All prior anon-fallback behavior, warnings, and error messages are unchanged (`resolveSupabaseKey` is reused as-is).
- **Relay selection is conservative.** Pairs are found by scanning env var names for `CUSTOM_CRED_*_URL` with a matching `CUSTOM_CRED_*_PROXY_AUTH_KEY`. A single pair is used. With several pairs, a relay is used only if exactly one URL unambiguously names this project's Supabase host; otherwise the relay is ignored and the anon fallback (with its warning) applies. The app never guesses which host's relay to send database traffic to.
- **Relay mode client.** In relay mode the Supabase client points at the relay URL with the proxy token as its key, and a fetch wrapper sends `x-api-key: <proxy token>` and deletes `Authorization` (the relay swaps credentials upstream; a stale bearer token left on the request would make PostgREST reject opaque keys with "Expected 3 parts in JWT").
- **`GET /api/admin/db-key-status`** (admin-only) returns `{ source, warning }` with `source` one of `service_role`, `relay`, `anon_fallback`. It exposes no key material, no URLs, and no tokens — it exists so the commissioner can confirm the server is on a service-level key before running `supabase_rls_lockdown.sql`, without needing sandbox logs. Resolution errors (no usable key at all) are caught and returned as a 500 with the existing safe error text.

## What was checked and does not need a code change

- The relay token is not the Supabase secret; it only authorizes the app to the relay. Even so it is treated as key material: it is never logged, never returned by the status endpoint, and not present in the client bundle.
- `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` remain off on the server client, so no user session can ride the connection (unchanged from PR #29).
- The status route sits behind `requireAdmin`; it performs no database access and returns a fixed shape.
- Existing behavior is untouched when no relay vars are present (local dev, and any host that keeps passing a raw secret env var).

## Findings

1. **Relay mode is a service-level connection.** Requests through the relay bypass row level security, same as a direct secret key. That is required and expected: the server is the only authorization layer. The `supabase_rls_lockdown.sql` precondition becomes "status reports `service_role` or `relay`".
2. **An ambiguous relay is ignored rather than guessed.** Sending database traffic through the wrong host's relay would leak the credential to another service; refusing is the safe failure.
3. **The admin endpoint reveals only the coarse source.** It cannot be used to fingerprint the key, the relay URL, or the token.
4. **No client-side surface changed.** The browser still talks only to `/api/...`; the relay is server-only.

## Testing

`tests/supabase-key.test.ts` (now 94 across the suite, all passing): relay pair detection (complete, partial, missing); multi-pair disambiguation by host; ambiguous pairs return null; connection resolution prefers a valid secret key, uses the relay when the secret variable is missing or holds a public key, and still falls back to anon with a warning that contains no relay URL or token; the relay fetch sets `x-api-key`, deletes `Authorization`, and leaves other headers intact. `npm run check` and `npm run build` pass; the client bundle contains no relay URL, proxy token, or key material.

## Conclusion

Cleared to publish. The site stays up through every transition: no relay → anon fallback (existing behavior), relay present → service-level access without any key material entering the app environment. Do not run `supabase_rls_lockdown.sql` until `GET /api/admin/db-key-status` reports `service_role` or `relay`.
