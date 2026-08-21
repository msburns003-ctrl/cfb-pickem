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

function buildQuickAccessLink(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/dashboard?token=${token}`;
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
    // Restore a session from a bookmarked quick-access link (#/path?token=...)
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    if (queryIndex !== -1) {
      const params = new URLSearchParams(hash.slice(queryIndex + 1));
      const token = params.get("token");
      if (token) {
        setAuthToken(token);
        setQuickAccessLink(buildQuickAccessLink(token));
        // Strip the token from the visible URL bar without losing the path
        const path = hash.slice(1, queryIndex);
        window.history.replaceState(null, "", `${window.location.pathname}#${path}`);
      }
    }
    loadMe();
  }, []);

  async function login(email: string, password: string) {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setAuthToken(data.token);
    setQuickAccessLink(buildQuickAccessLink(data.token));
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
