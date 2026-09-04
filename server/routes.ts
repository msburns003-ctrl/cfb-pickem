import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import { hashPassword, verifyPassword, generateToken, generateTempPassword, requireAuth, requireAdmin, toPublicUser, setAuthCookie, clearAuthCookie } from "./auth";
import {
  computePickType,
  gradeCompletedGames,
  ensureMoneyGamesAssigned,
  upsetPickPoints,
  computeStandings,
  ATS_THRESHOLD,
  getCurrentSeasonYear,
  getCristoBallLockDeadline,
  gradeCristoBallEntry,
} from "./scoring";
import { insertWeekSchema, type InsertWeek, insertCristoBallEntrySchema, insertCristoBallResultsSchema, insertCristoBallLockDeadlineSchema } from "@shared/schema";
import { checkGamesForWeek } from "./scores";
import { z } from "zod";
import { cached, invalidate, keys, prefixes, cacheStats } from "./cache";

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
    setAuthCookie(req, res, token);
    res.json({ user: toPublicUser({ ...user, authToken: token }) });
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    await storage.updateUser(req.user!.id, { authToken: null });
    clearAuthCookie(req, res);
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

  // Cached per-user for 10s. Includes myPicks/myUpsetPick, so keyed by user
  // AND week. Invalidated on any write that changes the picks the caller
  // sees (their own pick, their upset pick, week status changes,
  // admin game edits).
  app.get("/api/weeks/:id/dashboard", requireAuth, async (req, res) => {
    const weekId = Number(req.params.id);
    const userId = req.user!.id;
    let week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });
    week = await ensureMoneyGamesAssigned(week);
    const lockedWeek = week;

    const payload = await cached(keys.dashboard(userId, weekId), 10_000, async () => {
      const allGames = await storage.listGamesByWeek(weekId);
      const selectedGames = allGames.filter((g) => g.isSelected);
      const availableForUpset = allGames.filter((g) => !g.isSelected);

      const myPicks = await storage.listPicksByUser(userId, weekId);
      const myUpsetPick = await storage.getUpsetPick(weekId, userId);

      const now = Date.now();
      const deadlinePassed = now >= new Date(lockedWeek.pickDeadline).getTime();

      return {
        week: lockedWeek,
        games: selectedGames,
        availableForUpset,
        myPicks,
        myUpsetPick: myUpsetPick ?? null,
        deadlinePassed,
        locked: lockedWeek.status !== "open" || deadlinePassed,
      };
    });

    res.json(payload);
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
    // Invalidate: this user's dashboard for this week (their picks changed)
    // and the grid for this week (consensus % changed).
    invalidate(`dashboard:v1:${req.user!.id}:${weekId}`);
    invalidate(keys.grid(weekId));
    res.json({ pick });
  });

  // Saves several picks for this week in one request. The picks page stages
  // selections locally as the member clicks around and only calls this once
  // they hit "Save picks" — so a member flipping between teams a few times
  // doesn't fire a network request per click, and this remains a single
  // request no matter how many games they changed.
  //
  // Each entry is validated the same way as the single-pick route above, but
  // independently: a bad entry (game not in this slate, team not playing,
  // that specific game's kickoff already passed) is skipped and reported
  // rather than failing the whole batch, since the rest may still be valid.
  app.post("/api/weeks/:id/picks/batch", requireAuth, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const schema = z.object({
      picks: z.array(z.object({ gameId: z.number(), selectedTeam: z.string().min(1) })).min(1).max(100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "picks must be a non-empty array of {gameId, selectedTeam}" });

    if (week.status !== "open" || Date.now() >= new Date(week.pickDeadline).getTime()) {
      return res.status(403).json({ message: "Picks are locked for this week" });
    }

    const saved: { gameId: number; selectedTeam: string }[] = [];
    const skipped: { gameId: number; message: string }[] = [];
    const now = Date.now();

    // Each entry is fully isolated: a thrown error while saving one pick
    // (a transient DB hiccup, a dropped Supabase connection, anything
    // unexpected) must never take down entries that come after it in the
    // array, and must never erase entries that already succeeded before it.
    // A partial response is always better than a crashed one.
    for (const entry of parsed.data.picks) {
      try {
        const game = await storage.getGame(entry.gameId);
        if (!game || game.weekId !== weekId || !game.isSelected) {
          skipped.push({ gameId: entry.gameId, message: "Not part of this week's slate" });
          continue;
        }
        if (![game.awayTeam, game.homeTeam].includes(entry.selectedTeam)) {
          skipped.push({ gameId: entry.gameId, message: "Not one of the two teams playing" });
          continue;
        }
        if (now >= new Date(game.kickoff).getTime()) {
          skipped.push({ gameId: entry.gameId, message: "Kickoff already passed" });
          continue;
        }
        await storage.upsertPick({
          gameId: game.id,
          userId: req.user!.id,
          selectedTeam: entry.selectedTeam,
          submittedAt: new Date().toISOString(),
        });
        saved.push({ gameId: game.id, selectedTeam: entry.selectedTeam });
      } catch (err) {
        console.error(`picks/batch: failed to save gameId=${entry.gameId} for userId=${req.user!.id}`, err);
        skipped.push({ gameId: entry.gameId, message: "Couldn't save this one — try again" });
      }
    }

    if (saved.length > 0) {
      invalidate(`dashboard:v1:${req.user!.id}:${weekId}`);
      invalidate(keys.grid(weekId));
    }
    res.json({ saved, skipped });
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
    invalidate(`dashboard:v1:${req.user!.id}:${weekId}`);
    invalidate(keys.grid(weekId));
    res.json({ upsetPick, potentialPoints: upsetPickPoints(game.spread) });
  });

  // ---------------- STANDINGS ----------------
  // Cached for 30s. Standings only change when a week is graded, which is
  // a manual admin action — 30s is well below any real refresh cadence and
  // still keeps game-day load minimal. Invalidated in the grading handler.
  app.get("/api/standings", requireAuth, async (_req, res) => {
    const payload = await cached(keys.standings(), 30_000, async () => {
      const rows = await computeStandings();
      const weeks = await storage.listWeeks();
      const gradedWeeks = weeks.filter((w) => w.status === "graded").sort((a, b) => a.weekNumber - b.weekNumber);

      // Rank-change arrows compare the current standings to how they stood
      // before the most recently graded week's points were added. Only
      // meaningful once at least two weeks have been graded.
      let rowsWithChange = rows;
      if (gradedWeeks.length >= 2) {
        const priorWeekIds = gradedWeeks.slice(0, -1).map((w) => w.id);
        const priorRows = await computeStandings(priorWeekIds);
        const priorRankByUser = new Map(priorRows.map((r) => [r.userId, r.rank]));
        rowsWithChange = rows.map((r) => ({ ...r, previousRank: priorRankByUser.get(r.userId) ?? null }));
      }

      return { rows: rowsWithChange, weeks: gradedWeeks };
    });
    res.json(payload);
  });

  // ---------------- CRISTO-BALL ----------------
  app.get("/api/cristoball/me", requireAuth, async (req, res) => {
    const seasonYear = await getCurrentSeasonYear();
    const [entry, lockDeadline] = await Promise.all([
      storage.getCristoBallEntry(req.user!.id, seasonYear),
      getCristoBallLockDeadline(seasonYear),
    ]);
    const locked = lockDeadline != null && Date.now() >= new Date(lockDeadline).getTime();
    res.json({ seasonYear, entry: entry ?? null, locked, lockDeadline });
  });

  app.post("/api/cristoball/me", requireAuth, async (req, res) => {
    const seasonYear = await getCurrentSeasonYear();
    const lockDeadline = await getCristoBallLockDeadline(seasonYear);
    const locked = lockDeadline != null && Date.now() >= new Date(lockDeadline).getTime();
    if (locked) return res.status(403).json({ message: "Cristo-Ball picks are locked for this season" });

    const parsed = insertCristoBallEntrySchema.safeParse({ ...req.body, seasonYear });
    if (!parsed.success) return res.status(400).json({ message: "Invalid Cristo-Ball submission" });

    const entry = await storage.upsertCristoBallEntry({ ...parsed.data, userId: req.user!.id });
    res.json({ entry });
  });

  // ---------------- ADMIN CACHE INVALIDATION ----------------
  // Any admin write can change data reflected in cached reads (standings,
  // grid, dashboard) for someone. Rather than tracking exactly which
  // endpoints affect which caches, we invalidate all three prefixes on the
  // response of any successful (2xx) admin write. Over-invalidation costs
  // a recompute; under-invalidation shows stale data — the former is safer.
  //
  // Mounted before the admin routes so `res.on('finish')` is attached
  // before responses are sent.
  app.use("/api/admin", (req, res, next) => {
    const isWrite = req.method !== "GET" && req.method !== "HEAD";
    if (!isWrite) return next();
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidate(prefixes.standings);
        invalidate(prefixes.grid);
        invalidate(prefixes.dashboard);
      }
    });
    next();
  });

  app.get("/api/admin/cristoball", requireAdmin, async (_req, res) => {
    const seasonYear = await getCurrentSeasonYear();
    const [entries, results, users, lockDeadline] = await Promise.all([
      storage.listCristoBallEntries(seasonYear),
      storage.getCristoBallResults(seasonYear),
      storage.listUsers(),
      getCristoBallLockDeadline(seasonYear),
    ]);
    const locked = lockDeadline != null && Date.now() >= new Date(lockDeadline).getTime();
    const entriesWithNames = entries.map((e) => ({
      ...e,
      userName: users.find((u) => u.id === e.userId)?.name ?? "Unknown",
    }));
    res.json({
      seasonYear,
      entries: entriesWithNames,
      results: results ?? null,
      members: users.map((u) => ({ id: u.id, name: u.name })),
      memberCount: users.length,
      submittedCount: entries.length,
      locked,
      lockDeadline,
    });
  });

  app.put("/api/admin/cristoball/results", requireAdmin, async (req, res) => {
    const seasonYear = await getCurrentSeasonYear();
    const parsed = insertCristoBallResultsSchema.safeParse({ ...req.body, seasonYear });
    if (!parsed.success) return res.status(400).json({ message: "Invalid Cristo-Ball results" });
    const results = await storage.upsertCristoBallResults(parsed.data);
    res.json({ results });
  });

  // Sets or clears the dedicated Cristo-Ball entry lock deadline, independent
  // of any week's pick deadline. Passing null reverts to the legacy fallback
  // (the earliest weekly pick deadline in the season).
  app.put("/api/admin/cristoball/lock-deadline", requireAdmin, async (req, res) => {
    const seasonYear = await getCurrentSeasonYear();
    const parsed = insertCristoBallLockDeadlineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "lockDeadline must be an ISO date string or null" });
    if (parsed.data.lockDeadline !== null && Number.isNaN(new Date(parsed.data.lockDeadline).getTime())) {
      return res.status(400).json({ message: "lockDeadline must be a valid date" });
    }
    const results = await storage.setCristoBallLockDeadline(seasonYear, parsed.data.lockDeadline);
    res.json({ results, lockDeadline: results.lockDeadline });
  });

  app.post("/api/admin/cristoball/grade", requireAdmin, async (_req, res) => {
    const seasonYear = await getCurrentSeasonYear();
    const results = await storage.getCristoBallResults(seasonYear);
    if (!results) return res.status(400).json({ message: "Enter actual results before grading" });

    const entries = await storage.listCristoBallEntries(seasonYear);
    for (const entry of entries) {
      const { total, breakdown } = gradeCristoBallEntry(entry, results);
      await storage.updateCristoBallEntry(entry.id, { pointsEarned: total, pointsBreakdown: breakdown });
    }
    const graded = await storage.markCristoBallGraded(seasonYear, new Date().toISOString());
    res.json({ results: graded, gradedCount: entries.length });
  });

  // ---------------- PICKS GRID ----------------
  // Cached for 15s. The grid is only served once the week is locked, so
  // its contents can only change when admin edits game results or
  // regrades — both explicitly invalidated below.
  app.get("/api/weeks/:id/grid", requireAuth, async (req, res) => {
    const weekId = Number(req.params.id);
    let week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const now = Date.now();
    const locked = week.status !== "open" || now >= new Date(week.pickDeadline).getTime();
    if (!locked) {
      return res.status(403).json({ message: "The picks grid unlocks once this week's picks are locked." });
    }
    week = await ensureMoneyGamesAssigned(week);

    const payload = await cached(keys.grid(weekId), 15_000, async () => {
      return await computeGrid(weekId);
    });
    return res.json(payload);
  });

  // Grid computation extracted so it can be called from inside `cached()`.
  // Kept as a nested helper on the closure so it has access to `storage`.
  async function computeGrid(weekId: number) {
    const week = await storage.getWeek(weekId);
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
      const picksPoints = weekPicks
        .filter((p) => p.userId === m.id)
        .reduce((sum, p) => sum + (p.pointsEarned ?? 0), 0);
      const weekPoints = picksPoints + (upset?.pointsEarned ?? 0);
      return {
        userId: m.id,
        name: m.name,
        weekPoints,
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
    grid.sort((a, b) => b.weekPoints - a.weekPoints);

    // Consensus % per game: how the league split on each side, based on
    // picks actually submitted so far. Follows the same reveal timing as the
    // grid itself (only computed/returned once the week is locked).
    const consensus: Record<
      number,
      { awayCount: number; homeCount: number; awayPct: number; homePct: number; totalPicks: number }
    > = {};
    for (const g of selectedGames) {
      const gamePicks = weekPicks.filter((p) => p.gameId === g.id);
      const awayCount = gamePicks.filter((p) => p.selectedTeam === g.awayTeam).length;
      const homeCount = gamePicks.filter((p) => p.selectedTeam === g.homeTeam).length;
      const totalPicks = awayCount + homeCount;
      consensus[g.id] = {
        awayCount,
        homeCount,
        awayPct: totalPicks > 0 ? Math.round((awayCount / totalPicks) * 100) : 0,
        homePct: totalPicks > 0 ? Math.round((homeCount / totalPicks) * 100) : 0,
        totalPicks,
      };
    }

    return { week, games: selectedGames, grid, consensus };
  }

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
    let updated = await storage.updateWeek(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Week not found" });
    updated = await ensureMoneyGamesAssigned(updated);
    res.json({ week: updated });
  });

  app.delete("/api/admin/weeks/:id", requireAdmin, async (req, res) => {
    const weekId = Number(req.params.id);
    const week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });

    const weekPicks = await storage.listPicksByWeek(weekId);
    const weekUpsetPicks = await storage.listUpsetPicksByWeek(weekId);
    const pickCount = weekPicks.length + weekUpsetPicks.length;

    if (pickCount > 0 && req.query.force !== "true") {
      return res.status(409).json({
        message: `This week has ${pickCount} submitted pick(s). Deleting it will permanently erase them. Confirm to proceed.`,
        pickCount,
        requiresConfirmation: true,
      });
    }

    await storage.deleteWeek(weekId);
    res.json({ success: true });
  });

  app.get("/api/admin/weeks/:id", requireAdmin, async (req, res) => {
    const weekId = Number(req.params.id);
    let week = await storage.getWeek(weekId);
    if (!week) return res.status(404).json({ message: "Week not found" });
    week = await ensureMoneyGamesAssigned(week);
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
      const result = await gradeCompletedGames(Number(req.params.id));
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Failed to grade games" });
    }
  });

  app.post("/api/admin/weeks/:id/check-games", requireAdmin, async (req, res) => {
    try {
      const result = await checkGamesForWeek(Number(req.params.id));
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to check games" });
    }
  });

  return httpServer;
}
