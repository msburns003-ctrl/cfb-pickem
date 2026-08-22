// In-memory auth token store. The hosting iframe used for previews blocks
// cookies, localStorage, and sessionStorage entirely, so the token itself
// always lives only in memory for the current page's JS lifetime. Session
// persistence across reloads/backgrounding is handled separately in
// auth.tsx by keeping the token in the page's real URL query string (see
// `persistTokenInUrl`), which survives page reloads without touching any
// blocked storage API.
let token: string | null = null;

export function setAuthToken(t: string | null) {
  token = t;
}

export function getAuthToken(): string | null {
  return token;
}
