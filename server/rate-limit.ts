// =============================================================================
// rate-limit.ts — In-memory request limits, keyed by account rather than IP
// =============================================================================
//
// Limits are keyed by member account, not IP address, so they don't depend
// on how the hosting proxy reports client IPs and members sharing a network
// (a watch party, a household) never share a limit:
//   - Login: failed attempts per account. After LOGIN_MAX_FAILURES in the
//     window, that account is locked until the window ends, even with the
//     right password, so guessing can't continue. A success clears it.
//   - Every authenticated request (via requireAuth): per member, with a
//     separate, lower cap on writes. Generous: these stop runaway clients and
//     scripts, not normal use (game-day polling and refreshes stay far below).
// The server is a single long-lived process (see cache.ts), so memory is fine.

const MINUTE = 60_000;

export const LIMITS = {
  loginFailures: { max: 5, windowMs: 15 * MINUTE },
  memberRequests: { max: 300, windowMs: MINUTE },
  memberWrites: { max: 60, windowMs: MINUTE },
  adminRequests: { max: 600, windowMs: MINUTE },
  adminWrites: { max: 120, windowMs: MINUTE },
} as const;

type Limit = { max: number; windowMs: number };
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function bucket(key: string, limit: Limit, now: number): Bucket {
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + limit.windowMs };
    buckets.set(key, b);
  }
  return b;
}

export interface LimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/** Count one hit against `key`; refused once the window's max is reached. */
export function hit(key: string, limit: Limit, now = Date.now()): LimitResult {
  const b = bucket(key, limit, now);
  if (b.count >= limit.max) return { allowed: false, retryAfterMs: b.resetAt - now };
  b.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/** Whether `key` is currently over its limit, without counting a hit. */
export function isLimited(key: string, limit: Limit, now = Date.now()): LimitResult {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt || b.count < limit.max) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: b.resetAt - now };
}

export function clear(key: string) {
  buckets.delete(key);
}

export function resetAllLimits() {
  buckets.clear();
}

// ---- Login failures, per account ----

const loginKey = (email: string) => `login:${email.trim().toLowerCase()}`;

export function loginLocked(email: string, now = Date.now()): LimitResult {
  return isLimited(loginKey(email), LIMITS.loginFailures, now);
}

export function recordLoginFailure(email: string, now = Date.now()) {
  hit(loginKey(email), LIMITS.loginFailures, now);
}

export function clearLoginFailures(email: string) {
  clear(loginKey(email));
}

export function lockoutMessage(retryAfterMs: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / MINUTE));
  return `Too many failed attempts for this account. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or use Forgot password.`;
}

// ---- Authenticated requests, per member ----

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function memberRequestAllowed(user: { id: number; isAdmin: boolean }, method: string, now = Date.now()): LimitResult {
  const all = hit(`req:${user.id}`, user.isAdmin ? LIMITS.adminRequests : LIMITS.memberRequests, now);
  if (!all.allowed || !WRITE_METHODS.has(method)) return all;
  return hit(`write:${user.id}`, user.isAdmin ? LIMITS.adminWrites : LIMITS.memberWrites, now);
}

// Drop expired buckets so memory stays small.
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of Array.from(buckets.entries())) if (now >= b.resetAt) buckets.delete(key);
}, 5 * MINUTE).unref();
