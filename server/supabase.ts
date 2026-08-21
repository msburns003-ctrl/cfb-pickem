import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

// This app only uses Supabase's REST/Postgres client (no Realtime subscriptions),
// but the client still initializes a RealtimeClient internally. Node 20 lacks a
// native WebSocket global, so we pass the `ws` package as the transport to avoid
// a hard crash on startup.
//
// The client is created lazily (on first use) rather than at module-load time,
// so that a missing env var surfaces as a clear runtime error on the first API
// call instead of crashing the whole process before the HTTP server can even
// start listening.
let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY at first use. " +
        `Present env keys: ${Object.keys(process.env).filter((k) => k.includes("SUPABASE")).join(", ") || "(none matching SUPABASE)"}`,
    );
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. " +
        "Set them in .env (local) or as deployment credentials (production).",
    );
  }

  cached = createClient(supabaseUrl, supabaseAnonKey, {
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
