// Picks the key the Express server uses for Supabase.
//
// The secret key (new sb_secret_... keys, or the legacy service_role JWT)
// bypasses row level security. It must stay on the server. The public anon
// key is only a temporary fallback so a deploy that happens before
// SUPABASE_SERVICE_ROLE_KEY is set does not take the site down. Every
// fallback path returns a warning that is safe to log: it names the problem
// and never includes key material.

export type SupabaseKeySource = "service_role" | "anon_fallback";

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
