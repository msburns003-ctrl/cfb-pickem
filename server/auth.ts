import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";

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
const AUTH_COOKIE_NAME = "cfb_pickem_session";
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

function isRequestSecure(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function setAuthCookie(req: Request, res: Response, token: string) {
  const attrs = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (isRequestSecure(req)) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}

export function clearAuthCookie(req: Request, res: Response) {
  const attrs = [`${AUTH_COOKIE_NAME}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (isRequestSecure(req)) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (bearer) return bearer;
  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE_NAME];
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ message: "Session expired, please log in again" });
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
