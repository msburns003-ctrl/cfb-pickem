import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "./queryClient";

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The session lives in an httpOnly cookie set by the server — never in
// localStorage/sessionStorage/indexedDB, and never in the page's URL. A
// previous version of this app kept the login token in the visible address
// bar (`?token=...`) so sessions would survive reloads without touching a
// storage API. That meant copying the address bar — the natural way people
// share a link — handed the recipient a live, logged-in session as the
// original user. Cookies solve the same "survive a reload" problem without
// ever exposing the token anywhere a person could see or copy it.
function stripLegacyTokenFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("token")) {
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.toString());
  }
  // Old bookmarked links could also carry the token inside the hash
  // (#/path?token=...). Strip that too so the router doesn't choke on it.
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex !== -1) {
    const path = hash.slice(1, queryIndex);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${path}`);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = await res.json();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Any old link carrying a token in the URL is a leftover from the prior
    // design — never honor it as a login, just clean it out of the address
    // bar. The actual session, if any, comes from the httpOnly cookie.
    stripLegacyTokenFromUrl();
    loadMe();
  }, []);

  async function login(email: string, password: string) {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setUser(data.user);
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // ignore network errors on logout
    }
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
