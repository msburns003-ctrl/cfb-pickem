import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { resolveSupabaseConnection, type SupabaseKeySource } from "./supabase-key";

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

  const resolved = resolveSupabaseConnection(process.env);
  if (!resolved.url) {
    throw new Error(
      "Missing SUPABASE_URL. Set it in .env (local) or as a deployment variable (production).",
    );
  }
  if (resolved.warning) warnAnonFallback(resolved.warning);

  // No persisted session: a user JWT on this client would be sent instead of
  // the secret key, and row level security would then apply to the server.
  cached = createClient(resolved.url, resolved.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(resolved.fetch ? { global: { fetch: resolved.fetch } } : {}),
    realtime: {
      transport: ws as any,
    },
  });
  return cached;
}

export interface SupabaseConnectionStatus {
  source: SupabaseKeySource;
  /** Present when the server is not using a service-level key. Safe to log. */
  warning: string | null;
}

/**
 * Which database key the server would use right now, without key material.
 * "service_role" and "relay" both bypass row level security; only
 * "anon_fallback" means the lockdown SQL must not be run yet.
 */
export function supabaseConnectionStatus(): SupabaseConnectionStatus {
  const resolved = resolveSupabaseConnection(process.env);
  return { source: resolved.source, warning: resolved.warning };
}

// Proxy so existing call sites (`supabase.from(...)`) keep working unchanged
// while the underlying client is created lazily.
const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export default supabase;
