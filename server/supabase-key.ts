// Picks the key the Express server uses for Supabase.
//
// The secret key (new sb_secret_... keys, or the legacy service_role JWT)
// bypasses row level security. It must stay on the server. The public anon
// key is only a temporary fallback so a deploy that happens before
// SUPABASE_SERVICE_ROLE_KEY is set does not take the site down. Every
// fallback path returns a warning that is safe to log: it names the problem
// and never includes key material.

export type SupabaseKeySource = "service_role" | "relay" | "anon_fallback";

export interface ResolvedSupabaseKey {
  key: string;
  source: SupabaseKeySource;
  /** Set when the server is not using a secret key. Safe to log. */
  warning: string | null;
}

const STILL_ON_ANON = "still using the public anon key";

function normalize(value: string | undefined): string {
  if (!value) return "";
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** Why a non-empty SUPABASE_SERVICE_ROLE_KEY must not be used, or null when it is a secret key. */
export function serviceKeyProblem(key: string): string | null {
  if (key.startsWith("sb_secret_")) return null;
  if (key.startsWith("sb_publishable_")) return "it is a publishable key, which is public";
  const role = jwtRole(key);
  if (role === "service_role") return null;
  if (role === "anon") return "it is the public anon key";
  if (role === "authenticated") return "it is a signed-in user token, not the secret key";
  if (role) return `it is a token for the "${role}" role, not the secret key`;
  return "it is not a Supabase secret key";
}

function fallbackWarning(reason: string): string {
  return (
    `${reason} The server is ${STILL_ON_ANON}, so the site stays up. ` +
    "Put the secret key in SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API Keys; " +
    "it starts with sb_secret_, or use the legacy service_role key). " +
    "Do not run supabase_rls_lockdown.sql until this error stops. This fallback is temporary."
  );
}

/**
 * Choose the Supabase key from the environment.
 * Throws only when there is no usable key at all (no secret key and no anon fallback).
 */
export function resolveSupabaseKey(env: NodeJS.ProcessEnv): ResolvedSupabaseKey {
  const serviceKey = normalize(env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = normalize(env.SUPABASE_ANON_KEY);

  if (serviceKey) {
    const problem = serviceKeyProblem(serviceKey);
    if (!problem) {
      return { key: serviceKey, source: "service_role", warning: null };
    }
    if (!anonKey) {
      throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY was not used because ${problem}, and SUPABASE_ANON_KEY is not set, ` +
          "so the server cannot reach the database. Set SUPABASE_SERVICE_ROLE_KEY to the secret key " +
          "from Supabase → Project Settings → API Keys.",
      );
    }
    return {
      key: anonKey,
      source: "anon_fallback",
      warning: fallbackWarning(`SUPABASE_SERVICE_ROLE_KEY was not used because ${problem}.`),
    };
  }

  if (!anonKey) {
    throw new Error(
      "Missing a Supabase key. Set SUPABASE_SERVICE_ROLE_KEY to the secret key from " +
        "Supabase → Project Settings → API Keys. SUPABASE_ANON_KEY is only a temporary fallback.",
    );
  }

  return {
    key: anonKey,
    source: "anon_fallback",
    warning: fallbackWarning("SUPABASE_SERVICE_ROLE_KEY is not set."),
  };
}

/**
 * supabase-js sends the API key as `Authorization: Bearer <key>` as well as `apikey`.
 * Legacy service_role keys are JWTs and must stay on Authorization. New secret keys
 * (`sb_secret_...`) are not JWTs; PostgREST rejects them on Authorization with
 * "Expected 3 parts in JWT". They belong on the `apikey` header only.
 * Returns undefined for JWT keys so the client keeps its default headers.
 */
export function createSupabaseFetch(key: string): typeof fetch | undefined {
  if (!key.startsWith("sb_secret_")) return undefined;
  const bearer = `Bearer ${key}`;
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.get("Authorization") === bearer) {
      headers.delete("Authorization");
    }
    return fetch(input, { ...init, headers });
  };
}

// The website credential relay. On pplx.app, a custom credential the commissioner
// saves (Supabase's secret key) is not exposed to the app as a raw environment
// variable. Instead the host injects a pair of sandbox env vars:
//   CUSTOM_CRED_<HOST>_URL          a relay base URL that stands in for the API host
//   CUSTOM_CRED_<HOST>_PROXY_AUTH_KEY  a token the backend sends as x-api-key
// Requests through the relay are forwarded to Supabase with the real secret key
// attached, so the key itself never enters the app's environment or logs. The
// names are matched by prefix and suffix rather than the exact host so a renamed
// variable keeps working.

export interface RelayCredential {
  /** Relay base URL to use as the Supabase client's URL. */
  url: string;
  /** Token sent as x-api-key to authorize the app to the relay. */
  token: string;
}

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Find the credential relay for this project's Supabase host, if the host
 * attached one. Returns null when no complete pair is present, or when several
 * pairs exist and none unambiguously belongs to this project (an ambiguous relay
 * must not be used: pointing the client at the wrong host's relay would send the
 * database credentials somewhere else).
 */
export function findSupabaseRelayCredential(env: NodeJS.ProcessEnv): RelayCredential | null {
  const supabaseUrl = normalize(env.SUPABASE_URL);
  const supabaseHost = supabaseUrl ? hostFromUrl(supabaseUrl) : null;

  const matches: RelayCredential[] = [];
  for (const name of Object.keys(env)) {
    if (!name.startsWith("CUSTOM_CRED_") || !name.endsWith("_URL")) continue;
    const tokenName = name.slice(0, -"_URL".length) + "_PROXY_AUTH_KEY";
    const url = normalize(env[name]);
    const token = normalize(env[tokenName]);
    if (!url || !token || hostFromUrl(url) === null) continue;
    matches.push({ url, token });
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  if (!supabaseHost) return null;
  // Relay URLs are proxy addresses; the target host, when present, appears
  // anywhere in the URL (host or path), not necessarily as the hostname.
  const forThisHost = matches.filter((match) => match.url.toLowerCase().includes(supabaseHost));
  return forThisHost.length === 1 ? forThisHost[0] : null;
}

/**
 * Fetch wrapper for relay connections. Sends the proxy auth token as x-api-key
 * (that is how the relay recognizes this app) and removes Authorization: the
 * relay replaces credentials upstream, and a stale bearer token left on the
 * request would reach PostgREST and break opaque sb_secret_ keys
 * ("Expected 3 parts in JWT").
 */
export function createRelayFetch(token: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-api-key", token);
    headers.delete("Authorization");
    return fetch(input, { ...init, headers });
  };
}

export interface ResolvedSupabaseConnection {
  /** Base URL for the Supabase client. The relay URL when going through the relay. */
  url: string;
  /** Key handed to supabase-js. The relay overrides it upstream when used. */
  key: string;
  source: SupabaseKeySource;
  /** Set when the server is not using a service-level key. Safe to log. */
  warning: string | null;
  /** Set when the connection needs a custom fetch (relay or sb_secret_ keys). */
  fetch?: typeof fetch;
}

/**
 * Resolve how the server should reach Supabase: a directly configured secret key
 * first, then the host's credential relay, then the temporary anon fallback.
 * Throws only when nothing at all is usable.
 */
export function resolveSupabaseConnection(env: NodeJS.ProcessEnv): ResolvedSupabaseConnection {
  const baseUrl = normalize(env.SUPABASE_URL);
  const serviceKey = normalize(env.SUPABASE_SERVICE_ROLE_KEY);
  if (serviceKey && serviceKeyProblem(serviceKey) === null) {
    return { url: baseUrl, key: serviceKey, source: "service_role", warning: null, fetch: createSupabaseFetch(serviceKey) };
  }

  const relay = findSupabaseRelayCredential(env);
  if (relay) {
    return { url: relay.url, key: relay.token, source: "relay", warning: null, fetch: createRelayFetch(relay.token) };
  }

  const resolved = resolveSupabaseKey(env);
  return { url: baseUrl, key: resolved.key, source: resolved.source, warning: resolved.warning };
}
