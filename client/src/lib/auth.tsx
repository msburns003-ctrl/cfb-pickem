import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "./queryClient";
import { setAuthToken, getAuthToken } from "./auth-token";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  quickAccessLink: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Keep the auth token in the page's real URL query string (before the `#`),
// not the hash. wouter's hash router only ever reads `location.hash` for
// routing, so a token living in `location.search` never interferes with
// navigation, and client-side route changes preserve the existing search
// string automatically. Because it's part of the URL, the session survives
// full page reloads and mobile browsers reloading a backgrounded tab —
// the exact case that previously logged people out every time they left
// the page — without needing any storage API blocked in the preview iframe.
function persistTokenInUrl(token: string | null) {
  const url = new URL(window.location.href);
  if (token) {
    url.searchParams.set("token", token);
  } else {
    url.searchParams.delete("token");
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

function buildQuickAccessLink(token: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("token", token);
  return url.toString();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickAccessLink, setQuickAccessLink] = useState<string | null>(null);

  async function loadMe() {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = await res.json();
      setUser(data.user);
    } catch {
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Restore a session, preferring a token in the real query string (the
    // form the app keeps in sync automatically across reloads/navigation).
    let token = new URLSearchParams(window.location.search).get("token");

    // Fall back to a legacy bookmarked quick-access link that embedded the
    // token inside the hash (#/path?token=...) instead of the real query.
    if (!token) {
      const hash = window.location.hash;
      const queryIndex = hash.indexOf("?");
      if (queryIndex !== -1) {
        const hashParams = new URLSearchParams(hash.slice(queryIndex + 1));
        const hashToken = hashParams.get("token");
        if (hashToken) {
          token = hashToken;
          // Strip it from the hash so the router doesn't choke on the query part.
          const path = hash.slice(1, queryIndex);
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${path}`);
        }
      }
    }

    if (token) {
      setAuthToken(token);
      setQuickAccessLink(buildQuickAccessLink(token));
      persistTokenInUrl(token);
    }
    loadMe();
  }, []);

  async function login(email: string, password: string) {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setAuthToken(data.token);
    setQuickAccessLink(buildQuickAccessLink(data.token));
    persistTokenInUrl(data.token);
    setUser(data.user);
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // ignore network errors on logout
    }
    setAuthToken(null);
    setQuickAccessLink(null);
    persistTokenInUrl(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: loadMe, quickAccessLink }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
