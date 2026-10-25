import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fake, resetDb, user, week } from "./fake-storage";

vi.mock("../server/storage", () => ({ storage: fake }));
const { registerRoutes } = await import("../server/routes");
const { hashPassword } = await import("../server/auth");
const { LIMITS, hit, memberRequestAllowed, resetAllLimits } = await import("../server/rate-limit");

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
  resetAllLimits();
  user({ id: 1, name: "Matt", email: "matt@example.com", passwordHash: hashPassword("secret1") });
  user({ id: 2, name: "Chris", email: "chris@example.com", passwordHash: hashPassword("secret1") });
  user({ id: 3, name: "Admin", email: "admin@example.com", passwordHash: hashPassword("secret1"), isAdmin: true });
  week({ id: 1 });
});
afterEach(() => vi.useRealTimers());

const login = (email: string, password: string) =>
  fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

describe("login lockout (per account)", () => {
  it("locks an account after 5 failures, even for the right password, without affecting others", async () => {
    for (let i = 0; i < 5; i++) expect((await login("matt@example.com", "wrong")).status).toBe(401);
    const locked = await login("matt@example.com", "secret1");
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await locked.json()).message).toMatch(/Try again in 15 minutes/);
    // Someone else on the same network logs in fine.
    expect((await login("chris@example.com", "secret1")).status).toBe(200);
  });

  it("unlocks when the 15-minute window ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < 5; i++) await login("matt@example.com", "wrong");
    expect((await login("matt@example.com", "secret1")).status).toBe(429);
    vi.setSystemTime(Date.now() + LIMITS.loginFailures.windowMs + 1000);
    expect((await login("matt@example.com", "secret1")).status).toBe(200);
  });

  it("clears the count after a successful login, so occasional typos never lock anyone out", async () => {
    for (let i = 0; i < 4; i++) await login("matt@example.com", "wrong");
    expect((await login("matt@example.com", "secret1")).status).toBe(200);
    for (let i = 0; i < 4; i++) await login("matt@example.com", "wrong");
    expect((await login("matt@example.com", "secret1")).status).toBe(200);
  });

  it("treats unknown emails the same, so lockouts don't reveal who's a member", async () => {
    for (let i = 0; i < 5; i++) expect((await login("nobody@example.com", "x")).status).toBe(401);
    expect((await login("nobody@example.com", "x")).status).toBe(429);
  });

  it("counts wrong current passwords on the change-password form", async () => {
    const cookie = cookieOf(await login("matt@example.com", "secret1"));
    const change = (current: string) =>
      fetch(`${base}/api/auth/change-password`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: "newpass1" }),
      });
    for (let i = 0; i < 5; i++) expect((await change("wrong")).status).toBe(400);
    expect((await change("secret1")).status).toBe(429);
    expect((await login("matt@example.com", "secret1")).status).toBe(429);
  });
});

describe("per-member request limits", () => {
  it("allows normal use and caps runaway clients per member", () => {
    const member = { id: 1, isAdmin: false };
    const now = 1_000_000;
    for (let i = 0; i < LIMITS.memberRequests.max; i++) expect(memberRequestAllowed(member, "GET", now).allowed).toBe(true);
    expect(memberRequestAllowed(member, "GET", now).allowed).toBe(false);
    // A different member is unaffected, and the limit resets after the window.
    expect(memberRequestAllowed({ id: 2, isAdmin: false }, "GET", now).allowed).toBe(true);
    expect(memberRequestAllowed(member, "GET", now + LIMITS.memberRequests.windowMs).allowed).toBe(true);
  });

  it("has a lower cap on writes, and higher caps for admins", () => {
    const now = 2_000_000;
    for (let i = 0; i < LIMITS.memberWrites.max; i++) memberRequestAllowed({ id: 1, isAdmin: false }, "POST", now);
    expect(memberRequestAllowed({ id: 1, isAdmin: false }, "POST", now).allowed).toBe(false);
    expect(memberRequestAllowed({ id: 1, isAdmin: false }, "GET", now).allowed).toBe(true); // reads still fine
    for (let i = 0; i < LIMITS.memberWrites.max; i++) memberRequestAllowed({ id: 3, isAdmin: true }, "POST", now);
    expect(memberRequestAllowed({ id: 3, isAdmin: true }, "POST", now).allowed).toBe(true);
  });

  it("answers 429 with Retry-After once a member is over the limit", async () => {
    const cookie = cookieOf(await login("matt@example.com", "secret1"));
    expect((await fetch(`${base}/api/weeks`, { headers: { cookie } })).status).toBe(200);
    for (let i = 0; i < LIMITS.memberRequests.max; i++) hit("req:1", LIMITS.memberRequests);
    const res = await fetch(`${base}/api/weeks`, { headers: { cookie } });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another member is unaffected.
    const other = cookieOf(await login("chris@example.com", "secret1"));
    expect((await fetch(`${base}/api/weeks`, { headers: { cookie: other } })).status).toBe(200);
  });
});

describe("session token format", () => {
  it("rejects malformed tokens without a database lookup", async () => {
    const spy = vi.spyOn(fake, "getUserByToken");
    const res = await fetch(`${base}/api/weeks`, { headers: { cookie: "__Host-cfb_pickem_session=not-a-real-token" } });
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
