import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The client is created lazily (on first use) rather than at module-load time,
// so that a missing env var surfaces as a clear runtime error on the first API
// call instead of crashing the whole process before the HTTP server can even
// start listening.
//
// This app only uses Supabase's REST/Postgres client (`.from(...)`) — no
// Realtime subscriptions — so no realtime transport configuration is needed.
let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. " +
        "Set them in .env (local) or as deployment credentials (production).",
    );
  }

  cached = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
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
