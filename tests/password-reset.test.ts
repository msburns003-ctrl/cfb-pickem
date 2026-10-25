import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, fake, resetDb, user } from "./fake-storage";

vi.mock("../server/storage", () => ({ storage: fake }));
const sent: { to: string; text: string }[] = [];
vi.mock("../server/mailer", () => ({
  mailEnabled: () => true,
  sendMail: async (to: string, _subject: string, text: string) => {
    sent.push({ to, text });
  },
}));

process.env.RESET_TOKEN_SECRET = "test-secret-that-is-at-least-32-characters-long";
process.env.APP_URL = "https://cfb-pickem.example.com";

const { registerRoutes } = await import("../server/routes");
const { hashPassword } = await import("../server/auth");
const { createResetToken, verifyResetToken, resetRateLimits } = await import("../server/password-reset");

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  resetRateLimits();
  sent.length = 0;
  user({ id: 1, name: "Matt", email: "matt@example.com", passwordHash: hashPassword("oldpass"), authToken: "existing-session" });
});

const post = (path: string, body: object) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const settle = () => new Promise((r) => setTimeout(r, 50)); // emails send in the background

describe("reset tokens", () => {
  it("verify for an hour, then expire", async () => {
    const now = Date.now();
    const token = createResetToken(db.users[0], now);
    expect((await verifyResetToken(token, now + 59 * 60_000))?.id).toBe(1);
    expect(await verifyResetToken(token, now + 61 * 60_000)).toBeNull();
  });

  it("reject tampered tokens and stop working once the password changes", async () => {
    const token = createResetToken(db.users[0]);
    const [id, exp, sig] = token.split(".");
    expect(await verifyResetToken(`2.${exp}.${sig}`)).toBeNull(); // someone else's id
    expect(await verifyResetToken(`${id}.${Number(exp) + 1}.${sig}`)).toBeNull(); // extended expiry
    expect(await verifyResetToken("garbage")).toBeNull();
    db.users[0].passwordHash = hashPassword("changed");
    expect(await verifyResetToken(token)).toBeNull();
  });
});

describe("forgot / reset password API", () => {
  it("reports whether reset by email is available", async () => {
    expect(await (await fetch(`${base}/api/auth/config`)).json()).toEqual({ passwordResetEnabled: true });
  });

  it("answers the same for members and non-members, but only emails members", async () => {
    const member = await post("/api/auth/forgot-password", { email: "matt@example.com" });
    const stranger = await post("/api/auth/forgot-password", { email: "nobody@example.com" });
    expect(member.status).toBe(200);
    expect(stranger.status).toBe(200);
    expect(await member.json()).toEqual(await stranger.json());
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("matt@example.com");
    expect(sent[0].text).toContain("https://cfb-pickem.example.com/#/reset-password/");
  });

  it("limits requests per email so an inbox can't be flooded", async () => {
    for (let i = 0; i < 5; i++) await post("/api/auth/forgot-password", { email: "matt@example.com" });
    await settle();
    expect(sent).toHaveLength(3);
  });

  it("resets the password once, signs out other devices, and logs this one in", async () => {
    await post("/api/auth/forgot-password", { email: "matt@example.com" });
    await settle();
    const token = sent[0].text.match(/reset-password\/(\S+)/)![1];

    const res = await post("/api/auth/reset-password", { token, newPassword: "brandnew" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.passwordHash).toBeUndefined();
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    expect(cookie.startsWith("__Host-")).toBe(true);
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status).toBe(200);
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: "__Host-cfb_pickem_session=existing-session" } })).status).toBe(401);

    // The same link can't be used twice, and the new password works.
    expect((await post("/api/auth/reset-password", { token, newPassword: "another1" })).status).toBe(400);
    expect((await post("/api/auth/login", { email: "matt@example.com", password: "brandnew" })).status).toBe(200);
  });

  it("is switched off without its settings", async () => {
    const saved = process.env.RESET_TOKEN_SECRET;
    delete process.env.RESET_TOKEN_SECRET;
    try {
      expect(await (await fetch(`${base}/api/auth/config`)).json()).toEqual({ passwordResetEnabled: false });
      expect((await post("/api/auth/forgot-password", { email: "matt@example.com" })).status).toBe(503);
    } finally {
      process.env.RESET_TOKEN_SECRET = saved;
    }
  });
});
