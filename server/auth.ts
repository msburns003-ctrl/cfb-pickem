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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
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
