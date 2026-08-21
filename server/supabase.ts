import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. " +
      "Set them in .env (local) or as deployment credentials (production).",
  );
}

// This app only uses Supabase's REST/Postgres client (no Realtime subscriptions),
// but the client still initializes a RealtimeClient internally. Node 20 lacks a
// native WebSocket global, so we pass the `ws` package as the transport to avoid
// a hard crash on startup.
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    transport: ws as any,
  },
});

export default supabase;
