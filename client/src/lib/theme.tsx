import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";

// Remembered in a cookie rather than browser storage (not allowed in this
// app). The pplx.app proxy only keeps __Host- cookies. index.html applies the
// same cookie before first paint so dark mode doesn't flash light.
const COOKIE = "__Host-theme";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

function readPreference(): ThemePreference {
  const match = document.cookie.match(/(?:^|;\s*)__Host-theme=(light|dark)/);
  return (match?.[1] as ThemePreference | undefined) ?? "system";
}

function writePreference(pref: ThemePreference) {
  document.cookie =
    pref === "system"
      ? `${COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`
      : `${COOKIE}=${pref}; Path=/; Secure; SameSite=Lax; Max-Age=${ONE_YEAR_S}`;
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [prefersDark, setPrefersDark] = useState(systemDark);

  // Follow the device setting live while on "system".
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const dark = preference === "dark" || (preference === "system" && prefersDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  const setPreference = (pref: ThemePreference) => {
    writePreference(pref);
    setPreferenceState(pref);
  };

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
