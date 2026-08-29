// =============================================================================
// rateLimit.ts — Rate limiting middleware for CFB Pick'em
// =============================================================================
//
// Purpose:
//   Protect auth, pick submission, admin, and read endpoints from abuse,
//   brute-force login attempts, and runaway clients. Tuned for a ~40-member
//   private league.
//
// Deploy context:
//   Long-lived Node/Express server behind the *.pplx.app hosting proxy.
//   The proxy sets X-Forwarded-* headers, so `trust proxy` MUST be enabled
//   on the Express app (see server/index.ts) — otherwise every request
//   looks like it came from the proxy's IP and all users get lumped into
//   one bucket.
//
//   Because the server is long-lived (not serverless), the default
//   in-memory store from express-rate-limit is sufficient. No Redis
//   required.
//
// Keying:
//   Prefers authenticated user id (req.user.id) over IP so multiple league
//   members behind a shared network aren't lumped together.
//
// Logging:
//   Every 429 response is logged via console.warn with route, limiter,
//   user id, and IP so we can review the first week's rollout and tune.
//
// Rollout:
//   The global limiter runs at a conservative 600/min for the first week
//   to avoid false-positives. Tighten to 300/min after 7 days of clean
//   logs (see TODO below).
//
// =============================================================================

import rateLimit, { Options } from "express-rate-limit";
import type { Request, Response } from "express";

// -----------------------------------------------------------------------------
// Shared config
// -----------------------------------------------------------------------------

// Standardized 429 logger. Fires whenever any limiter rejects a request.
function logRejection(limiterName: string) {
  return (req: Request, _res: Response, _next: unknown, options: Options) => {
    // Structured log line — easy to grep in server logs.
    console.warn(
      `[rate-limit] 429 limiter=${limiterName} route=${req.method} ${req.originalUrl} ` +
        `user=${(req as any).user?.id ?? "anon"} ip=${req.ip} ` +
        `max=${options.max} windowMs=${options.windowMs}`,
    );
    _res
      .status(options.statusCode)
      .json(options.message ?? { message: "Too many requests" });
  };
}

// Key by authenticated user id when available; fall back to IP.
// Requires `app.set("trust proxy", 1)` for IP to be correct behind the proxy.
const userOrIp = (req: Request) => (req as any).user?.id ?? req.ip ?? "unknown";

const baseOptions: Partial<Options> = {
  standardHeaders: true, // RateLimit-* headers (RFC standard)
  legacyHeaders: false, // omit deprecated X-RateLimit-*
};

// -----------------------------------------------------------------------------
// 1. AUTH LIMITER — strict, IP-based
//    Applied to: /api/auth/login, /api/auth/change-password
//    Rationale: 5 attempts / 15 min follows OWASP guidance for
//    credential-stuffing / brute-force protection. Successful logins are
//    skipped so a typo doesn't lock out a legitimate user after they retry.
// -----------------------------------------------------------------------------
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
  handler: logRejection("auth"),
});

// -----------------------------------------------------------------------------
// 2. PICK WRITE LIMITER — allows rapid corrections before kickoff
//    Applied to: POST /api/weeks/:id/picks, /picks/batch, /upset-pick,
//                POST /api/cristoball/me
//    Rationale: A user editing all ~12-15 weekly games in quick succession
//    generates a burst. 40/min leaves headroom for last-minute corrections
//    without allowing a runaway script to hammer Supabase.
// -----------------------------------------------------------------------------
export const pickWriteLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: userOrIp,
  message: { message: "Slow down — too many pick updates. Retry in a minute." },
  handler: logRejection("pick-write"),
});

// -----------------------------------------------------------------------------
// 3. READ LIMITER — generous for game-day refresh behavior
//    Applied to: GET /api/weeks, /weeks/:id/dashboard, /standings,
//                /weeks/:id/grid, /cristoball/me, /auth/me
//    Rationale: 2 refreshes/sec/user is fine; bots at 10/sec are not.
// -----------------------------------------------------------------------------
export const readLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: userOrIp,
  message: { message: "Too many requests. Slow down for a moment." },
  handler: logRejection("read"),
});

// -----------------------------------------------------------------------------
// 4. ADMIN LIMITER — bursty admin work (week lock, member CRUD, grading)
//    Applied to: /api/admin/*
//    Rationale: Locking a week + bulk-updating members generates a burst;
//    60/min covers it comfortably for a single admin at a time.
// -----------------------------------------------------------------------------
export const adminLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: userOrIp,
  message: { message: "Too many admin actions. Retry in a minute." },
  handler: logRejection("admin"),
});

// -----------------------------------------------------------------------------
// 5. GLOBAL FALLBACK — hard ceiling for anything unaccounted for
//    Applied to: all /api/* routes
//    Rationale: Catches bots and any traffic not covered by a specific
//    limiter above.
//
//    ROLLOUT: Starts at 600/min for the first week to avoid false-positives
//    while real traffic patterns emerge. Tighten to 300/min after review.
//    TODO(kevin, after 2026-09-05): drop max from 600 -> 300 once 7-day
//    log review confirms no legitimate users hit 429.
//
//    Admins (req.user.isAdmin) are skipped so week-rollover setup work
//    isn't accidentally limited.
// -----------------------------------------------------------------------------
export const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 600, // conservative rollout value; target 300 (see TODO)
  skip: (req) => (req as any).user?.isAdmin === true,
  message: { message: "Too many requests." },
  handler: logRejection("global"),
});
