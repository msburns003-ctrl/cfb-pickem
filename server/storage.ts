import {
  users,
  weeks,
  games,
  picks,
  upsetPicks,
  type User,
  type InsertUser,
  type Week,
  type InsertWeek,
  type Game,
  type InsertGame,
  type Pick,
  type InsertPick,
  type UpsetPick,
  type InsertUpsetPick,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, asc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema: { users, weeks, games, picks, upsetPicks } });

export interface IStorage {
  // users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listUsers(): Promise<User[]>;
  updateUser(id: number, fields: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  // weeks
  listWeeks(): Promise<Week[]>;
  getWeek(id: number): Promise<Week | undefined>;
  createWeek(week: InsertWeek): Promise<Week>;
  updateWeek(id: number, fields: Partial<Week>): Promise<Week | undefined>;

  // games
  listGamesByWeek(weekId: number): Promise<Game[]>;
  getGame(id: number): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  createGames(games: InsertGame[]): Promise<Game[]>;
  updateGame(id: number, fields: Partial<Game>): Promise<Game | undefined>;
  deleteGame(id: number): Promise<void>;

  // picks
  listPicksByWeek(weekId: number): Promise<Pick[]>;
  listPicksByUser(userId: number, weekId: number): Promise<Pick[]>;
  getPick(gameId: number, userId: number): Promise<Pick | undefined>;
  upsertPick(pick: InsertPick): Promise<Pick>;
  updatePick(id: number, fields: Partial<Pick>): Promise<Pick | undefined>;

  // upset picks
  getUpsetPick(weekId: number, userId: number): Promise<UpsetPick | undefined>;
  listUpsetPicksByWeek(weekId: number): Promise<UpsetPick[]>;
  upsertUpsetPick(pick: InsertUpsetPick): Promise<UpsetPick>;
  updateUpsetPick(id: number, fields: Partial<UpsetPick>): Promise<UpsetPick | undefined>;
}

export class DatabaseStorage implements IStorage {
  // ---------- users ----------
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByEmail(email: string): Promise<User | undefined> {
    return db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .get();
  }
  async getUserByToken(token: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.authToken, token)).get();
  }
  async createUser(user: InsertUser): Promise<User> {
    return db
      .insert(users)
      .values({ ...user, email: user.email.toLowerCase().trim() })
      .returning()
      .get();
  }
  async listUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(asc(users.name)).all();
  }
  async updateUser(id: number, fields: Partial<User>): Promise<User | undefined> {
    return db.update(users).set(fields).where(eq(users.id, id)).returning().get();
  }
  async deleteUser(id: number): Promise<void> {
    db.delete(users).where(eq(users.id, id)).run();
  }

  // ---------- weeks ----------
  async listWeeks(): Promise<Week[]> {
    return db.select().from(weeks).orderBy(desc(weeks.seasonYear), desc(weeks.weekNumber)).all();
  }
  async getWeek(id: number): Promise<Week | undefined> {
    return db.select().from(weeks).where(eq(weeks.id, id)).get();
  }
  async createWeek(week: InsertWeek): Promise<Week> {
    return db.insert(weeks).values(week).returning().get();
  }
  async updateWeek(id: number, fields: Partial<Week>): Promise<Week | undefined> {
    return db.update(weeks).set(fields).where(eq(weeks.id, id)).returning().get();
  }

  // ---------- games ----------
  async listGamesByWeek(weekId: number): Promise<Game[]> {
    return db.select().from(games).where(eq(games.weekId, weekId)).orderBy(asc(games.sortOrder), asc(games.kickoff)).all();
  }
  async getGame(id: number): Promise<Game | undefined> {
    return db.select().from(games).where(eq(games.id, id)).get();
  }
  async createGame(game: InsertGame): Promise<Game> {
    return db.insert(games).values(game).returning().get();
  }
  async createGames(gameList: InsertGame[]): Promise<Game[]> {
    if (gameList.length === 0) return [];
    return db.insert(games).values(gameList).returning().all();
  }
  async updateGame(id: number, fields: Partial<Game>): Promise<Game | undefined> {
    return db.update(games).set(fields).where(eq(games.id, id)).returning().get();
  }
  async deleteGame(id: number): Promise<void> {
    db.delete(games).where(eq(games.id, id)).run();
  }

  // ---------- picks ----------
  async listPicksByWeek(weekId: number): Promise<Pick[]> {
    const rows = await db
      .select({ pick: picks })
      .from(picks)
      .innerJoin(games, eq(picks.gameId, games.id))
      .where(eq(games.weekId, weekId))
      .all();
    return rows.map((r) => r.pick);
  }
  async listPicksByUser(userId: number, weekId: number): Promise<Pick[]> {
    const rows = await db
      .select({ pick: picks })
      .from(picks)
      .innerJoin(games, eq(picks.gameId, games.id))
      .where(and(eq(picks.userId, userId), eq(games.weekId, weekId)))
      .all();
    return rows.map((r) => r.pick);
  }
  async getPick(gameId: number, userId: number): Promise<Pick | undefined> {
    return db.select().from(picks).where(and(eq(picks.gameId, gameId), eq(picks.userId, userId))).get();
  }
  async upsertPick(pick: InsertPick): Promise<Pick> {
    const existing = await this.getPick(pick.gameId, pick.userId);
    if (existing) {
      return db
        .update(picks)
        .set({ selectedTeam: pick.selectedTeam, submittedAt: pick.submittedAt })
        .where(eq(picks.id, existing.id))
        .returning()
        .get();
    }
    return db.insert(picks).values(pick).returning().get();
  }
  async updatePick(id: number, fields: Partial<Pick>): Promise<Pick | undefined> {
    return db.update(picks).set(fields).where(eq(picks.id, id)).returning().get();
  }

  // ---------- upset picks ----------
  async getUpsetPick(weekId: number, userId: number): Promise<UpsetPick | undefined> {
    return db
      .select()
      .from(upsetPicks)
      .where(and(eq(upsetPicks.weekId, weekId), eq(upsetPicks.userId, userId)))
      .get();
  }
  async listUpsetPicksByWeek(weekId: number): Promise<UpsetPick[]> {
    return db.select().from(upsetPicks).where(eq(upsetPicks.weekId, weekId)).all();
  }
  async upsertUpsetPick(pick: InsertUpsetPick): Promise<UpsetPick> {
    const existing = await this.getUpsetPick(pick.weekId, pick.userId);
    if (existing) {
      return db
        .update(upsetPicks)
        .set({
          gameId: pick.gameId,
          underdogTeam: pick.underdogTeam,
          favoriteTeam: pick.favoriteTeam,
          spread: pick.spread,
          submittedAt: pick.submittedAt,
        })
        .where(eq(upsetPicks.id, existing.id))
        .returning()
        .get();
    }
    return db.insert(upsetPicks).values(pick).returning().get();
  }
  async updateUpsetPick(id: number, fields: Partial<UpsetPick>): Promise<UpsetPick | undefined> {
    return db.update(upsetPicks).set(fields).where(eq(upsetPicks.id, id)).returning().get();
  }
}

export const storage = new DatabaseStorage();
