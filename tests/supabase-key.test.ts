import { describe, expect, it } from "vitest";
import {
  createRelayFetch,
  createSupabaseFetch,
  findSupabaseRelayCredential,
  resolveSupabaseConnection,
  resolveSupabaseKey,
  serviceKeyProblem,
} from "../server/supabase-key";

const CANARY_SECRET = "sb_secret_CANARY_DO_NOT_LEAK";
const CANARY_ANON = "sb_publishable_CANARY_ANON_DO_NOT_LEAK";
const CANARY_JWT_SECRET = "service-role-jwt-CANARY_DO_NOT_LEAK";

function jwt(payload: Record<string, unknown>, signature = "sig"): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.${signature}`;
}

const serviceJwt = jwt({ role: "service_role", marker: CANARY_JWT_SECRET });
const anonJwt = jwt({ role: "anon", marker: CANARY_ANON });

describe("resolveSupabaseKey", () => {
  it("uses a new secret key and does not warn", () => {
    const resolved = resolveSupabaseKey({
      SUPABASE_SERVICE_ROLE_KEY: CANARY_SECRET,
      SUPABASE_ANON_KEY: anonJwt,
    });
    expect(resolved.source).toBe("service_role");
    expect(resolved.key).toBe(CANARY_SECRET);
    expect(resolved.warning).toBeNull();
  });

  it("uses a legacy service_role JWT", () => {
    const resolved = resolveSupabaseKey({ SUPABASE_SERVICE_ROLE_KEY: serviceJwt });
    expect(resolved.source).toBe("service_role");
    expect(resolved.key).toBe(serviceJwt);
    expect(resolved.warning).toBeNull();
    expect(serviceKeyProblem(serviceJwt)).toBeNull();
  });

  it("trims whitespace and matching quotes around the secret key", () => {
    const resolved = resolveSupabaseKey({
      SUPABASE_SERVICE_ROLE_KEY: `  "${CANARY_SECRET}"  `,
    });
    expect(resolved.source).toBe("service_role");
    expect(resolved.key).toBe(CANARY_SECRET);
  });

  it("falls back to the anon key when the secret key is missing, without logging it", () => {
    const resolved = resolveSupabaseKey({
      SUPABASE_SERVICE_ROLE_KEY: "   ",
      SUPABASE_ANON_KEY: anonJwt,
    });
    expect(resolved.source).toBe("anon_fallback");
    expect(resolved.key).toBe(anonJwt);
    expect(resolved.warning).toContain("still using the public anon key");
    expect(resolved.warning).toContain("SUPABASE_SERVICE_ROLE_KEY is not set");
    expect(resolved.warning).not.toContain(anonJwt);
    expect(resolved.warning).not.toContain(CANARY_ANON);
  });

  it("ignores a public key pasted into the secret variable and falls back", () => {
    for (const wrong of [anonJwt, CANARY_ANON, `  '${CANARY_ANON}'`]) {
      const resolved = resolveSupabaseKey({
        SUPABASE_SERVICE_ROLE_KEY: wrong,
        SUPABASE_ANON_KEY: anonJwt,
      });
      expect(resolved.source).toBe("anon_fallback");
      expect(resolved.key).toBe(anonJwt);
      expect(resolved.warning).toContain("still using the public anon key");
      expect(resolved.warning).not.toContain(CANARY_ANON);
      expect(resolved.warning).not.toContain(anonJwt);
      expect(resolved.warning).not.toContain(CANARY_SECRET);
    }
  });

  it("ignores an unrecognized value instead of sending it to Supabase", () => {
    const garbage = "not-a-key-CANARY_DO_NOT_LEAK";
    const resolved = resolveSupabaseKey({
      SUPABASE_SERVICE_ROLE_KEY: garbage,
      SUPABASE_ANON_KEY: anonJwt,
    });
    expect(resolved.source).toBe("anon_fallback");
    expect(resolved.key).toBe(anonJwt);
    expect(resolved.warning).toContain("not a Supabase secret key");
    expect(resolved.warning).not.toContain(garbage);
  });

  it("throws when the secret key is wrong and there is no anon fallback, without the key in the error", () => {
    const garbage = "not-a-key-CANARY_DO_NOT_LEAK";
    for (const wrong of [garbage, anonJwt]) {
      try {
        resolveSupabaseKey({ SUPABASE_SERVICE_ROLE_KEY: wrong });
        throw new Error("should have thrown");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain("SUPABASE_ANON_KEY is not set");
        expect(message).not.toContain(garbage);
        expect(message).not.toContain(anonJwt);
        expect(message).not.toContain(CANARY_ANON);
      }
    }
  });

  it("throws when neither key is set", () => {
    expect(() => resolveSupabaseKey({})).toThrow(/Missing a Supabase key/);
  });
});

describe("createSupabaseFetch", () => {
  it("leaves legacy service_role JWTs on the default client path", () => {
    expect(createSupabaseFetch(serviceJwt)).toBeUndefined();
  });

  it("sends a secret key only on apikey, not Authorization", async () => {
    const fetchImpl = createSupabaseFetch(CANARY_SECRET);
    expect(fetchImpl).toBeTypeOf("function");
    const original = globalThis.fetch;
    let authorization: string | null = null;
    let apikey: string | null = null;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("Authorization");
      apikey = headers.get("apikey");
      return new Response("ok");
    }) as typeof fetch;
    try {
      await fetchImpl!("https://example.test/rest/v1/users", {
        headers: {
          apikey: CANARY_SECRET,
          Authorization: `Bearer ${CANARY_SECRET}`,
        },
      });
    } finally {
      globalThis.fetch = original;
    }
    expect(apikey).toBe(CANARY_SECRET);
    expect(authorization).toBeNull();
  });

  it("keeps a real user JWT on Authorization", async () => {
    const fetchImpl = createSupabaseFetch(CANARY_SECRET)!;
    const original = globalThis.fetch;
    let authorization: string | null = null;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("Authorization");
      return new Response("ok");
    }) as typeof fetch;
    try {
      await fetchImpl("https://example.test/rest/v1/users", {
        headers: { apikey: CANARY_SECRET, Authorization: `Bearer ${serviceJwt}` },
      });
    } finally {
      globalThis.fetch = original;
    }
    expect(authorization).toBe(`Bearer ${serviceJwt}`);
  });
});

const CANARY_RELAY_URL = "https://relay.example.test/ooamcrjoonfsehfxzjiu.supabase.co";
const CANARY_RELAY_TOKEN = "agp-canary-relay-token-DO_NOT_LEAK";

function relayEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    SUPABASE_URL: "https://ooamcrjoonfsehfxzjiu.supabase.co",
    SUPABASE_ANON_KEY: anonJwt,
    CUSTOM_CRED_OOAMCRJOONFSEHFXZJIU_SUPABASE_CO_URL: CANARY_RELAY_URL,
    CUSTOM_CRED_OOAMCRJOONFSEHFXZJIU_SUPABASE_CO_PROXY_AUTH_KEY: CANARY_RELAY_TOKEN,
    ...extra,
  };
}

describe("findSupabaseRelayCredential", () => {
  it("finds a complete relay pair", () => {
    const relay = findSupabaseRelayCredential(relayEnv());
    expect(relay).toEqual({ url: CANARY_RELAY_URL, token: CANARY_RELAY_TOKEN });
  });

  it("ignores a pair whose token variable is missing or blank", () => {
    const partial = {
      SUPABASE_URL: "https://ooamcrjoonfsehfxzjiu.supabase.co",
      CUSTOM_CRED_OOAMCRJOONFSEHFXZJIU_SUPABASE_CO_URL: CANARY_RELAY_URL,
      CUSTOM_CRED_OOAMCRJOONFSEHFXZJIU_SUPABASE_CO_PROXY_AUTH_KEY: "  ",
    };
    expect(findSupabaseRelayCredential(partial)).toBeNull();
    expect(findSupabaseRelayCredential({})).toBeNull();
  });

  it("disambiguates multiple pairs by the Supabase host", () => {
    const relay = findSupabaseRelayCredential(
      relayEnv({
        CUSTOM_CRED_OTHER_HOST_COM_URL: "https://relay.example.test/other-host",
        CUSTOM_CRED_OTHER_HOST_COM_PROXY_AUTH_KEY: "agp-other-token-DO_NOT_LEAK",
      }),
    );
    expect(relay).toEqual({ url: CANARY_RELAY_URL, token: CANARY_RELAY_TOKEN });
  });

  it("refuses to guess when several pairs are ambiguous", () => {
    const relay = findSupabaseRelayCredential({
      SUPABASE_URL: "https://ooamcrjoonfsehfxzjiu.supabase.co",
      SUPABASE_ANON_KEY: anonJwt,
      CUSTOM_CRED_FIRST_HOST_COM_URL: "https://relay-one.example.test/opaque-path",
      CUSTOM_CRED_FIRST_HOST_COM_PROXY_AUTH_KEY: "agp-first-token-DO_NOT_LEAK",
      CUSTOM_CRED_SECOND_HOST_COM_URL: "https://relay-two.example.test/other-opaque",
      CUSTOM_CRED_SECOND_HOST_COM_PROXY_AUTH_KEY: "agp-second-token-DO_NOT_LEAK",
    });
    expect(relay).toBeNull();
  });
});

describe("resolveSupabaseConnection", () => {
  it("uses the credential relay when no secret key is set", () => {
    const connection = resolveSupabaseConnection(relayEnv());
    expect(connection.source).toBe("relay");
    expect(connection.url).toBe(CANARY_RELAY_URL);
    expect(connection.key).toBe(CANARY_RELAY_TOKEN);
    expect(connection.warning).toBeNull();
    expect(connection.fetch).toBeTypeOf("function");
  });

  it("prefers a valid secret key over the relay", () => {
    const connection = resolveSupabaseConnection(
      relayEnv({ SUPABASE_SERVICE_ROLE_KEY: CANARY_SECRET }),
    );
    expect(connection.source).toBe("service_role");
    expect(connection.url).toBe("https://ooamcrjoonfsehfxzjiu.supabase.co");
    expect(connection.key).toBe(CANARY_SECRET);
  });

  it("uses the relay when the secret variable holds a public key", () => {
    const connection = resolveSupabaseConnection(
      relayEnv({ SUPABASE_SERVICE_ROLE_KEY: CANARY_ANON }),
    );
    expect(connection.source).toBe("relay");
    expect(connection.key).toBe(CANARY_RELAY_TOKEN);
  });

  it("still falls back to anon with a loggable warning when there is no relay", () => {
    const connection = resolveSupabaseConnection({
      SUPABASE_URL: "https://ooamcrjoonfsehfxzjiu.supabase.co",
      SUPABASE_ANON_KEY: anonJwt,
    });
    expect(connection.source).toBe("anon_fallback");
    expect(connection.warning).toContain("still using the public anon key");
    expect(connection.warning).not.toContain(CANARY_RELAY_TOKEN);
    expect(connection.warning).not.toContain(CANARY_RELAY_URL);
  });
});

describe("createRelayFetch", () => {
  it("sends the relay token as x-api-key and drops Authorization", async () => {
    const fetchImpl = createRelayFetch(CANARY_RELAY_TOKEN);
    const original = globalThis.fetch;
    let xApiKey: string | null = null;
    let authorization: string | null = null;
    let apikey: string | null = null;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      xApiKey = headers.get("x-api-key");
      authorization = headers.get("Authorization");
      apikey = headers.get("apikey");
      return new Response("ok");
    }) as typeof fetch;
    try {
      await fetchImpl("https://example.test/rest/v1/users", {
        headers: {
          apikey: anonJwt,
          Authorization: `Bearer ${anonJwt}`,
        },
      });
    } finally {
      globalThis.fetch = original;
    }
    expect(xApiKey).toBe(CANARY_RELAY_TOKEN);
    expect(authorization).toBeNull();
    expect(apikey).toBe(anonJwt);
  });
});
