// Auth token store. The published app runs on its own origin, so localStorage
// persists the login across page reloads, new tabs, and closing/reopening the
// browser. Some embedded/preview contexts still block storage, so we fall back
// to an in-memory token for the current page load, plus the bookmarkable
// "quick access" link (hash param) so members can restore a session manually
// when storage isn't available.
const STORAGE_KEY = "cfb-pickem-auth-token";

let memoryToken: string | null = null;
let storageAvailable = true;

try {
  const probeKey = "__cfb_pickem_storage_test__";
  localStorage.setItem(probeKey, "1");
  localStorage.removeItem(probeKey);
} catch {
  storageAvailable = false;
}

export function setAuthToken(t: string | null) {
  memoryToken = t;
  if (!storageAvailable) return;
  try {
    if (t) {
      localStorage.setItem(STORAGE_KEY, t);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    storageAvailable = false;
  }
}

export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  if (!storageAvailable) return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    storageAvailable = false;
    return null;
  }
}
