// In-memory auth token store. The preview/hosting iframe blocks cookies,
// localStorage, and sessionStorage, so the token lives only in memory for the
// current page session. A bookmarkable "quick access" link (hash param) lets
// members skip re-typing their password on future visits.
let token: string | null = null;

export function setAuthToken(t: string | null) {
  token = t;
}

export function getAuthToken(): string | null {
  return token;
}
