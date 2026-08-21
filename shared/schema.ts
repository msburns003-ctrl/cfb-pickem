import { sqliteTable, text, integer, real, unique } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------- Users ----------
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  authToken: text("auth_token"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).pick({
  name: true,
  email: true,
  passwordHash: true,
  isAdmin: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type PublicUser = Omit<User, "passwordHash" | "authToken">;

// ---------- Weeks ----------
export const weeks = sqliteTable("weeks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seasonYear: integer("season_year").notNull(),
  weekNumber: integer("week_number").notNull(),
  label: text("label").notNull(),
  pickDeadline: text("pick_deadline").notNull(), // ISO datetime string
  moneyGameCount: integer("money_game_count").notNull().default(2),
  status: text("status", { enum: ["setup", "open", "locked", "graded"] })
    .notNull()
    .default("setup"),
});

export const insertWeekSchema = createInsertSchema(weeks).omit({ id: true });
export type InsertWeek = z.infer<typeof insertWeekSchema>;
export type Week = typeof weeks.$inferSelect;

// ---------- Games ----------
export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekId: integer("week_id")
    .notNull()
    .references(() => weeks.id),
  sourceFixtureId: text("source_fixture_id"),
  awayTeam: text("away_team").notNull(),
  homeTeam: text("home_team").notNull(),
  awayRank: integer("away_rank"),
  homeRank: integer("home_rank"),
  favoriteTeam: text("favorite_team").notNull(),
  spread: real("spread").notNull(), // absolute points favorite is favored by
  kickoff: text("kickoff").notNull(), // ISO datetime string
  broadcast: text("broadcast"),
  pickType: text("pick_type", { enum: ["SU", "ATS"] }).notNull(),
  isSelected: integer("is_selected", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status", { enum: ["scheduled", "final"] })
    .notNull()
    .default("scheduled"),
  awayScore: integer("away_score"),
  homeScore: integer("home_score"),
  winner: text("winner"),
  atsResult: text("ats_result", { enum: ["favorite", "underdog", "push"] }),
  isMoneyGame: integer("is_money_game", { mode: "boolean" }).notNull().default(false),
});

export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

// ---------- Picks ----------
export const picks = sqliteTable(
  "picks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    selectedTeam: text("selected_team").notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }),
    pointsEarned: integer("points_earned"),
    submittedAt: text("submitted_at").notNull(),
  },
  (t) => ({
    uniqGamePerUser: unique().on(t.gameId, t.userId),
  }),
);

export const insertPickSchema = createInsertSchema(picks).omit({
  id: true,
  isCorrect: true,
  pointsEarned: true,
});
export type InsertPick = z.infer<typeof insertPickSchema>;
export type Pick = typeof picks.$inferSelect;

// ---------- Upset Picks (bonus weekly pick) ----------
export const upsetPicks = sqliteTable(
  "upset_picks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekId: integer("week_id")
      .notNull()
      .references(() => weeks.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    underdogTeam: text("underdog_team").notNull(),
    favoriteTeam: text("favorite_team").notNull(),
    spread: real("spread").notNull(),
    result: text("result", { enum: ["pending", "win", "loss", "push"] })
      .notNull()
      .default("pending"),
    pointsEarned: integer("points_earned").notNull().default(0),
    submittedAt: text("submitted_at").notNull(),
  },
  (t) => ({
    uniqWeekPerUser: unique().on(t.weekId, t.userId),
  }),
);

export const insertUpsetPickSchema = createInsertSchema(upsetPicks).omit({
  id: true,
  result: true,
  pointsEarned: true,
});
export type InsertUpsetPick = z.infer<typeof insertUpsetPickSchema>;
export type UpsetPick = typeof upsetPicks.$inferSelect;
