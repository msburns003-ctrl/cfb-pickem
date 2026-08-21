import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import { hashPassword, verifyPassword, generateToken, generateTempPassword, requireAuth, requireAdmin, toPublicUser } from "./auth";
import { computePickType, gradeWeek, upsetPickPoints, computeStandings, ATS_THRESHOLD } from "./scoring";
import { insertWeekSchema, type InsertWeek } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---------------- AUTH ----------------
  app.post("/api/auth/login", async (req, res) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Email and password are required" });
    const user = await storage.getUserByEmail(parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = generateToken();
    await storage.updateUser(user.id, { authToken: token });
    res.json({ user: toPublicUser({ ...user, authToken: token }), token });
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    await storage.updateUser(req.user!.id, { authToken: null });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json({ user: toPublicUser(req.user!) });
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "New password must be at least 6 characters" });
    if (!verifyPassword(parsed.data.currentPassword, req.user!.passwordHash)) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    await storage.updateUser(req.user!.id, {
      passwordHash: hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    });
    res.json({ ok: true });
  });

  // ---------------- MEMBER-FACING WEEKS/PICKS ----------------
  app.get("/api/weeks", requireAuth, async (_req, res) => {
    const weeks = await storage.listWeeks();
    res.json({ weeks });
  });

  app.get("/api/weeks/:id/dashboard", requireAuth, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const allGames = await storage.listGamesByWeek(weekId);
    const selectedGames = allGames.filter((g) => g.isSelected);
    const availableForUpset = allGames.filter((g) => !g.isSelected);

    const myPicks = await storage.listPicksByUser(req.user!.id, weekId);
    const myUpsetPick = await storage.getUpsetPick(weekId, req.user!.id);

    const now = Date.now();
    const deadlinePassed = now >= new Date(week.pickDeadline).getTime();

    res.json({
      week,
      games: selectedGames,
      availableForUpset,
      myPicks,
      myUpsetPick: myUpsetPick ?? null,
      deadlinePassed,
      locked: week.status !== "open" || deadlinePassed,
    });
  });

  app.post("/api/weeks/:id/picks", requireAuth, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const schema = z.object({ gameId: z.number(), selectedTeam: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "gameId and selectedTeam are required" });

    const game = await storage.getGame(parsed.data.gameId);
    if (!game || game.weekId !== weekId || !game.isSelected) {
      return res.status(400).json({ message: "That game is not part of this week's slate" });
    }
    if (![game.awayTeam, game.homeTeam].includes(parsed.data.selectedTeam)) {
      return res.status(400).json({ message: "selectedTeam must be one of the two teams playing" });
    }

    const now = Date.now();
    if (week.status !== "open" || now >= new Date(week.pickDeadline).getTime() || now >= new Date(game.kickoff).getTime()) {
      return res.status(403).json({ message: "Picks are locked for this game or week" });
    }

    const pick = await storage.upsertPick({
      gameId: game.id,
      userId: req.user!.id,
      selectedTeam: parsed.data.selectedTeam,
      submittedAt: new Date().toISOString(),
    });
    res.json({ pick });
  });

  app.post("/api/weeks/:id/upset-pick", requireAuth, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const schema = z.object({ gameId: z.number() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "gameId is required" });

    const game = await storage.getGame(parsed.data.gameId);
    if (!game || game.weekId !== weekId) {
      return res.status(400).json({ message: "Game not found in this week" });
    }
    if (game.isSelected) {
      return res.status(400).json({ message: "Your bonus underdog pick has to be a game that's not already on the main slate" });
    }

    const now = Date.now();
    if (week.status !== "open" || now >= new Date(week.pickDeadline).getTime() || now >= new Date(game.kickoff).getTime()) {
      return res.status(403).json({ message: "The bonus pick is locked for this game or week" });
    }

    const underdogTeam = game.favoriteTeam === game.awayTeam ? game.homeTeam : game.awayTeam;

    const upsetPick = await storage.upsertUpsetPick({
      weekId,
      userId: req.user!.id,
      gameId: game.id,
      underdogTeam,
      favoriteTeam: game.favoriteTeam,
      spread: game.spread,
      submittedAt: new Date().toISOString(),
    });
    res.json({ upsetPick, potentialPoints: upsetPickPoints(game.spread) });
  });

  // ---------------- STANDINGS ----------------
  app.get("/api/standings", requireAuth, async (_req, res) => {
    const rows = await computeStandings();
    const weeks = await storage.listWeeks();
    const gradedWeeks = weeks.filter((w) => w.status === "graded");
    res.json({ rows, weeks: gradedWeeks });
  });

  // ---------------- PICKS GRID ----------------
  app.get("/api/weeks/:id/grid", requireAuth, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const now = Date.now();
    const locked = week.status !== "open" || now >= new Date(week.pickDeadline).getTime();
    if (!locked) {
      return res.status(403).json({ message: "The picks grid unlocks once this week's picks are locked." });
    }

    const allGames = await storage.listGamesByWeek(weekId);
    const selectedGames = allGames.filter((g) => g.isSelected);
    const weekPicks = await storage.listPicksByWeek(weekId);
    const weekUpsetPicks = await storage.listUpsetPicksByWeek(weekId);
    const members = await storage.listUsers();

    const grid = members.map((m) => {
      const picksByGame: Record<number, { selectedTeam: string; isCorrect: boolean | null }> = {};
      for (const p of weekPicks) {
        if (p.userId === m.id) {
          picksByGame[p.gameId] = { selectedTeam: p.selectedTeam, isCorrect: p.isCorrect ?? null };
        }
      }
      const upset = weekUpsetPicks.find((u) => u.userId === m.id) ?? null;
      return {
        userId: m.id,
        name: m.name,
        picks: picksByGame,
        upsetPick: upset
          ? {
              underdogTeam: upset.underdogTeam,
              favoriteTeam: upset.favoriteTeam,
              spread: upset.spread,
              result: upset.result,
              pointsEarned: upset.pointsEarned,
            }
          : null,
      };
    });

    res.json({ week, games: selectedGames, grid });
  });

  // ---------------- ADMIN: MEMBERS ----------------
  app.get("/api/admin/members", requireAdmin, async (_req, res) => {
    const members = await storage.listUsers();
    res.json({ members: members.map(toPublicUser) });
  });

  app.post("/api/admin/members", requireAdmin, async (req, res) => {
    const schema = z.object({ name: z.string().min(1), email: z.string().email(), isAdmin: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Name and valid email are required" });

    const existing = await storage.getUserByEmail(parsed.data.email);
    if (existing) return res.status(409).json({ message: "A member with that email already exists" });

    const tempPassword = generateTempPassword();
    const user = await storage.createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: hashPassword(tempPassword),
      isAdmin: parsed.data.isAdmin ?? false,
    });
    res.json({ member: toPublicUser(user), tempPassword });
  });

  app.patch("/api/admin/members/:id", requireAdmin, async (req, res) => {
    const schema = z.object({ name: z.string().min(1).optional(), email: z.string().email().optional(), isAdmin: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid fields" });
    const updated = await storage.updateUser(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Member not found" });
    res.json({ member: toPublicUser(updated) });
  });

  app.delete("/api/admin/members/:id", requireAdmin, async (req, res) => {
    await storage.deleteUser(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/admin/members/:id/reset-password", requireAdmin, async (req, res) => {
    const tempPassword = generateTempPassword();
    const updated = await storage.updateUser(Number(req.params.id), {
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: true,
      authToken: null,
    });
    if (!updated) return res.status(404).json({ message: "Member not found" });
    res.json({ member: toPublicUser(updated), tempPassword });
  });

  // ---------------- ADMIN: WEEKS ----------------
  app.post("/api/admin/weeks", requireAdmin, async (req, res) => {
    const parsed = insertWeekSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid week data", errors: parsed.error.issues });
    const week = await storage.createWeek(parsed.data as InsertWeek);
    res.json({ week });
  });

  app.patch("/api/admin/weeks/:id", requireAdmin, async (req, res) => {
    const schema = z.object({
      label: z.string().optional(),
      pickDeadline: z.string().optional(),
      moneyGameCount: z.number().int().min(0).optional(),
      status: z.enum(["setup", "open", "locked", "graded"]).optional(),
      payoutAmount: z.number().min(0).nullable().optional(),
      payoutPaid: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid fields" });
    const updated = await storage.updateWeek(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Week not found" });
    res.json({ week: updated });
  });

  app.get("/api/admin/weeks/:id", requireAdmin, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });
    const allGames = await storage.listGamesByWeek(weekId);
    const weekPicks = await storage.listPicksByWeek(weekId);
    const weekUpsetPicks = await storage.listUpsetPicksByWeek(weekId);
    const members = await storage.listUsers();

    const pickProgress = members.map((m) => ({
      userId: m.id,
      name: m.name,
      picksSubmitted: weekPicks.filter((p) => p.userId === m.id).length,
      hasUpsetPick: weekUpsetPicks.some((u) => u.userId === m.id),
    }));

    const hasGradedPoints = weekPicks.some((p) => p.pointsEarned != null) || weekUpsetPicks.some((u) => u.pointsEarned != null);
    let weeklyWinners: { userId: number; name: string; points: number }[] = [];
    if (hasGradedPoints) {
      const pointsByUser = new Map<number, number>();
      for (const m of members) pointsByUser.set(m.id, 0);
      for (const p of weekPicks) {
        if (p.pointsEarned != null) pointsByUser.set(p.userId, (pointsByUser.get(p.userId) ?? 0) + p.pointsEarned);
      }
      for (const u of weekUpsetPicks) {
        pointsByUser.set(u.userId, (pointsByUser.get(u.userId) ?? 0) + u.pointsEarned);
      }
      const maxPoints = Math.max(...Array.from(pointsByUser.values()));
      weeklyWinners = members
        .filter((m) => pointsByUser.get(m.id) === maxPoints)
        .map((m) => ({ userId: m.id, name: m.name, points: maxPoints }));
    }

    res.json({ week, games: allGames, pickProgress, ATS_THRESHOLD, weeklyWinners });
  });

  // ---------------- ADMIN: GAME CANDIDATES / SELECTION ----------------
  app.post("/api/admin/weeks/:id/games/import", requireAdmin, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const gameSchema = z.object({
      sourceFixtureId: z.string().optional(),
      awayTeam: z.string(),
      homeTeam: z.string(),
      awayRank: z.number().int().nullable().optional(),
      homeRank: z.number().int().nullable().optional(),
      favoriteTeam: z.string(),
      spread: z.number(),
      kickoff: z.string(),
      broadcast: z.string().nullable().optional(),
    });
    const schema = z.object({ games: z.array(gameSchema).min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid game candidates", errors: parsed.error.issues });

    const existing = await storage.listGamesByWeek(weekId);
    const maxSort = existing.reduce((m, g) => Math.max(m, g.sortOrder), 0);

    const toInsert = parsed.data.games.map((g, idx) => ({
      weekId,
      sourceFixtureId: g.sourceFixtureId,
      awayTeam: g.awayTeam,
      homeTeam: g.homeTeam,
      awayRank: g.awayRank ?? null,
      homeRank: g.homeRank ?? null,
      favoriteTeam: g.favoriteTeam,
      spread: Math.abs(g.spread),
      kickoff: g.kickoff,
      broadcast: g.broadcast ?? null,
      pickType: computePickType(g.spread),
      isSelected: false,
      sortOrder: maxSort + idx + 1,
      status: "scheduled" as const,
    }));

    const created = await storage.createGames(toInsert);
    res.json({ games: created });
  });

  app.patch("/api/admin/games/:id", requireAdmin, async (req, res) => {
    const schema = z.object({
      isSelected: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      spread: z.number().optional(),
      favoriteTeam: z.string().optional(),
      kickoff: z.string().optional(),
      broadcast: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid fields" });
    const fields: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.spread != null) fields.pickType = computePickType(parsed.data.spread);
    const updated = await storage.updateGame(Number(req.params.id), fields);
    if (!updated) return res.status(404).json({ message: "Game not found" });
    res.json({ game: updated });
  });

  app.delete("/api/admin/games/:id", requireAdmin, async (req, res) => {
    await storage.deleteGame(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/admin/games/:id/result", requireAdmin, async (req, res) => {
    const schema = z.object({ awayScore: z.number().int().min(0), homeScore: z.number().int().min(0) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "awayScore and homeScore are required" });
    const updated = await storage.updateGame(Number(req.params.id), {
      awayScore: parsed.data.awayScore,
      homeScore: parsed.data.homeScore,
      status: "final",
    });
    if (!updated) return res.status(404).json({ message: "Game not found" });
    res.json({ game: updated });
  });

  app.post("/api/admin/weeks/:id/grade", requireAdmin, async (req, res) => {
    try {
      await gradeWeek(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Failed to grade week" });
    }
  });

  return httpServer;
}
