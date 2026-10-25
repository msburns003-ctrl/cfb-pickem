// =============================================================================
// password-reset.ts — "Forgot password" links without storing anything
// =============================================================================
//
// A reset link carries `<userId>.<expiresAt>.<signature>`, signed with
// RESET_TOKEN_SECRET over the user id, expiry AND the user's current password
// hash. So a link expires after an hour and stops working as soon as the
// password changes, which makes it single-use, with no database table.
// Needs RESET_TOKEN_SECRET (32+ characters), APP_URL (the site's address, so
// links never take a hostname from the request) and the SMTP settings.

import { createHmac, timingSafeEqual } from "node:crypto";
import { storage } from "./storage";
import { mailEnabled, sendMail } from "./mailer";
import type { User } from "@shared/schema";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function secret(): string | null {
  const s = process.env.RESET_TOKEN_SECRET;
  return s && s.length >= 32 ? s : null;
}

function appUrl(): string | null {
  const raw = process.env.APP_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.hostname === "localhost" ? url.origin : null;
  } catch {
    return null;
  }
}

export function passwordResetEnabled(): boolean {
  return secret() !== null && appUrl() !== null && mailEnabled();
}

function sign(userId: number, expiresAt: number, passwordHash: string, key: string): string {
  return createHmac("sha256", key).update(`${userId}.${expiresAt}.${passwordHash}`).digest("base64url");
}

export function createResetToken(user: Pick<User, "id" | "passwordHash">, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("Password reset is not configured");
  const expiresAt = now + TOKEN_TTL_MS;
  return `${user.id}.${expiresAt}.${sign(user.id, expiresAt, user.passwordHash, key)}`;
}

/** The user a reset token belongs to, or null if it's malformed, expired, tampered with or already used. */
export async function verifyResetToken(token: string, now = Date.now()): Promise<User | null> {
  const key = secret();
  const match = /^(\d{1,10})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!key || !match) return null;
  const userId = Number(match[1]);
  const expiresAt = Number(match[2]);
  if (now > expiresAt) return null;
  const user = await storage.getUser(userId);
  if (!user) return null;
  const expected = Buffer.from(sign(userId, expiresAt, user.passwordHash, key));
  const given = Buffer.from(match[3]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? user : null;
}

// Simple in-memory limits so the form can't be used to flood an inbox.
const WINDOW_MS = 15 * 60 * 1000;
const hits = new Map<string, number[]>();
function allow(key: string, max: number, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
export function resetRateLimits() {
  hits.clear();
}

/**
 * Emails a reset link if the address belongs to a member. Callers always
 * give the same response, so the form never reveals who is in the league.
 */
export async function requestPasswordReset(email: string, ip: string, now = Date.now()): Promise<void> {
  const trimmed = email.trim();
  const normalized = trimmed.toLowerCase();
  // Behind the host's proxy many members can share one IP, so the per-IP cap
  // is loose; the per-email cap is what stops flooding one inbox.
  if (!allow(`ip:${ip}`, 30, now) || !allow(`email:${normalized}`, 3, now)) return;
  const user = (await storage.getUserByEmail(trimmed)) ?? (await storage.getUserByEmail(normalized));
  const base = appUrl();
  if (!user || !base) return;

  const link = `${base}/#/reset-password/${createResetToken(user, now)}`;
  const text = [
    `Hi ${user.name},`,
    "",
    "Someone asked to reset your CFB Pick'em password. To choose a new one, open this link within an hour:",
    link,
    "",
    "If you didn't ask, ignore this email; your password won't change.",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(user.name)},</p><p>Someone asked to reset your CFB Pick'em password. To choose a new one, open this link within an hour:</p><p><a href="${escapeHtml(link)}">Reset my password</a></p><p>If you didn't ask, ignore this email; your password won't change.</p>`;
  await sendMail(user.email, "Reset your CFB Pick'em password", text, html);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
