import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // response wasn't JSON, fall back to status text
    }
    throw new Error(message);
  }
}

// The session is an httpOnly cookie set by the server on login, so the
// browser attaches it automatically — the client never reads or stores the
// token itself. `credentials: "include"` makes fetch send that cookie.
function requestHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  opts?: { allowStatuses?: number[] },
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: requestHeaders(!!data),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!opts?.allowStatuses?.includes(res.status)) {
    await throwIfResNotOk(res);
  }
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: requestHeaders(false),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// React Query defaults.
//
// Previous config used `staleTime: Infinity`, which meant queries never
// refetched on their own — users saw a snapshot of the data from whenever
// they first loaded the page. That kept the app quiet, but made
// standings/dashboard feel stale (a graded game wouldn't show up until a
// full page reload) and required manual invalidation everywhere.
//
// New defaults:
//   - staleTime 30s: matches the server-side /standings cache TTL, so
//     background refetches align with when the server actually has new
//     data. Zero risk of thundering-herd on the DB because the server
//     cache absorbs it.
//   - refetchOnWindowFocus stays FALSE: users flip to ESPN and back
//     constantly on game day; auto-refetching every focus is noisy and
//     wastes bandwidth. Users can pull-to-refresh / hard-refresh if
//     they want fresh data immediately.
//   - refetchOnReconnect TRUE: if a user's phone drops WiFi and comes
//     back, refetch once so they don't stare at stale data.
//   - retry 1 for queries: one network hiccup shouldn't surface as an
//     error to the user. Mutations still retry 0 (see below).
//
// Mutations keep retry: 0 — auto-retrying a pick submission is dangerous
// (could double-submit if the first request actually succeeded but the
// response was lost).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});
