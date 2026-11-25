import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { createSupabaseFetch, resolveSupabaseKey } from "./supabase-key";

// The client is created lazily (on first use) rather than at module-load time,
// so that a missing env var surfaces as a clear runtime error on the first API
// call instead of crashing the whole process before the HTTP server can even
// start listening.
//
// This app only uses Supabase's REST/Postgres client (`.from(...)`) — no
// Realtime subscriptions — so no realtime transport configuration is needed.
// The `ws` transport is still supplied because supabase-js constructs a
// RealtimeClient internally and Node has no native WebSocket global.
//
// The key is the server-only secret (SUPABASE_SERVICE_ROLE_KEY). It bypasses
// row level security. If that variable is missing or is not a secret key, the
// server keeps using the public anon key and logs an error, so publishing this
// code before the host has the new variable does not take the site down.
// The fallback is temporary: do not run supabase_rls_lockdown.sql until the
// error stops. The key itself is never logged.
let cached: SupabaseClient | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

const FALLBACK_WARN_MS = 15 * 60 * 1000;

function warnAnonFallback(warning: string): void {
  console.error(`[supabase] ${warning}`);
  if (fallbackTimer) return;
  const timer = setInterval(() => {
    console.error(`[supabase] ${warning}`);
  }, FALLBACK_WARN_MS);
  fallbackTimer = timer;
  // Node timers can be unref'd so a pending warning does not hold the process
  // open. The DOM lib's setInterval return type has no unref, so narrow it.
  (timer as { unref?: () => void }).unref?.();
}

function getClient(): SupabaseClient {
  if (cached) return cached;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error(
      "Missing SUPABASE_URL. Set it in .env (local) or as a deployment variable (production).",
    );
  }

  const resolved = resolveSupabaseKey(process.env);
  if (resolved.warning) warnAnonFallback(resolved.warning);

  // No persisted session: a user JWT on this client would be sent instead of
  // the secret key, and row level security would then apply to the server.
  const secretFetch = createSupabaseFetch(resolved.key);
  cached = createClient(supabaseUrl, resolved.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(secretFetch ? { global: { fetch: secretFetch } } : {}),
    realtime: {
      transport: ws as any,
    },
  });
  return cached;
}

// Proxy so existing call sites (`supabase.from(...)`) keep working unchanged
// while the underlying client is created lazily.
const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export default supabase;
