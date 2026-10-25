import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, fake, game, pick, resetDb, user, week } from "./fake-storage";

vi.mock("../server/storage", () => ({ storage: fake }));
const { registerRoutes } = await import("../server/routes");
const { hashPassword } = await import("../server/auth");
const { resetAllLimits } = await import("../server/rate-limit");

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
  user({ id: 2, name: "Admin", email: "admin@example.com", passwordHash: hashPassword("secret1"), isAdmin: true });
});

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
async function login(email = "matt@example.com", password = "secret1") {
  return fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
}
const get = (path: string, cookie?: string) => fetch(base + path, { headers: cookie ? { cookie } : {} });

describe("sessions", () => {
  it("never returns password hashes or session tokens in JSON", async () => {
    const res = await login();
    const body = await res.json();
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.authToken).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    expect((await login("matt@example.com", "nope")).status).toBe(401);
  });

  it("keeps every device logged in, logs out one device at a time, and signs others out on password change", async () => {
    const a = cookieOf(await login());
    const b = cookieOf(await login());
    expect(a.startsWith("__Host-")).toBe(true);
    expect((await get("/api/auth/me", a)).status).toBe(200);

    await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie: a } });
    expect((await get("/api/auth/me", b)).status).toBe(200);

    const changed = await fetch(`${base}/api/auth/change-password`, {
      method: "POST",
      headers: { cookie: b, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "secret1", newPassword: "secret2" }),
    });
    expect(changed.status).toBe(200);
    expect((await get("/api/auth/me", b)).status).toBe(401);
    expect((await get("/api/auth/me", cookieOf(changed))).status).toBe(200);
  });
});

describe("access control", () => {
  it("requires a session for member routes and an admin for admin routes", async () => {
    expect((await get("/api/standings")).status).toBe(401);
    const member = cookieOf(await login());
    expect((await get("/api/admin/members", member)).status).toBe(403);
    const admin = cookieOf(await login("admin@example.com"));
    expect((await get("/api/admin/members", admin)).status).toBe(200);
  });
});

describe("league split", () => {
  it("only reveals counts for games that have kicked off", async () => {
    const now = Date.now();
    week({ id: 1, pickDeadline: new Date(now + 3600e3).toISOString() });
    game({ id: 10, weekId: 1, awayTeam: "A", homeTeam: "B", favoriteTeam: "A", spread: 3, kickoff: new Date(now - 3600e3).toISOString() });
    game({ id: 11, weekId: 1, awayTeam: "C", homeTeam: "D", favoriteTeam: "C", spread: 3, kickoff: new Date(now + 3600e3).toISOString() });
    pick({ id: 1, gameId: 10, userId: 1, selectedTeam: "A" });
    pick({ id: 2, gameId: 10, userId: 2, selectedTeam: "B" });
    pick({ id: 3, gameId: 11, userId: 1, selectedTeam: "C" });
    const res = await get("/api/weeks/1/consensus", cookieOf(await login()));
    expect(await res.json()).toEqual({ games: { 10: { awayCount: 1, homeCount: 1, totalPicks: 2 } } });
  });
});
