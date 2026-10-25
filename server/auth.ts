import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { memberRequestAllowed } from "./rate-limit";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const existing = Buffer.from(hash, "hex");
  if (candidate.length !== existing.length) return false;
  return timingSafeEqual(candidate, existing);
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

const WORDS = [
  "gridiron",
  "endzone",
  "kickoff",
  "blitz",
  "huddle",
  "touchback",
  "onside",
  "hashmark",
  "redzone",
  "fumble",
];
export function generateTempPassword(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}${digits}`;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Sessions are carried in an httpOnly cookie so the token never appears in
// a URL a member could copy, bookmark, or paste into a chat with someone
// else. (An `Authorization: Bearer` header is still accepted as a fallback
// for API tooling/testing, but the browser app itself only uses the
// cookie.)
//
// The cookie name MUST use the `__Host-` prefix: the hosting proxy for
// published *.pplx.app sites strips any request cookie whose name doesn't
// start with `__Host-`, specifically to prevent cross-tenant cookie
// leakage between different published sites on the same domain. A plainly
// named cookie (e.g. `cfb_pickem_session`) is silently dropped by the
// proxy in production even though it appears to work fine in local dev.
//
// The `__Host-` prefix has browser-enforced requirements: the cookie must
// set `Secure`, must NOT set `Domain`, and must set `Path=/`. We always set
// `Secure`, even in local dev over plain HTTP, to satisfy the prefix rule.
// That does mean a real browser won't store the cookie during local
// HTTP-only testing, but it's required for correctness on the deployed
// HTTPS site.
const AUTH_COOKIE_NAME = "__Host-cfb_pickem_session";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function setAuthCookie(_req: Request, res: Response, token: string) {
  const attrs = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`,
  ];
  res.append("Set-Cookie", attrs.join("; "));
}

export function clearAuthCookie(_req: Request, res: Response) {
  const attrs = [`${AUTH_COOKIE_NAME}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Secure", "Max-Age=0"];
  res.append("Set-Cookie", attrs.join("; "));
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (bearer) return bearer;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE_NAME];
}

// Session tokens are always 64 hex characters (generateToken), so anything
// else is rejected without a database lookup.
const TOKEN_FORMAT = /^[0-9a-f]{64}$/;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = TOKEN_FORMAT.test(token) ? await storage.getUserByToken(token) : undefined;
  if (!user) {
    return res.status(401).json({ message: "Session expired, please log in again" });
  }
  // Per-member request limits (see rate-limit.ts), applied once we know who it is.
  const limit = memberRequestAllowed(user, req.method);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return res.status(429).json({ message: "Too many requests. Wait a moment and try again." });
  }
  req.user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  });
}

export function toPublicUser(user: User) {
  const { passwordHash, authToken, ...rest } = user;
  return rest;
}
