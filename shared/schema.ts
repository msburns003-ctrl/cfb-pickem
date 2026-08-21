import { z } from "zod";

// ---------- Users ----------
export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  authToken: string | null;
  mustChangePassword: boolean;
}

export const insertUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  passwordHash: z.string().min(1),
  isAdmin: z.boolean().optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type PublicUser = Omit<User, "passwordHash" | "authToken">;

// ---------- Weeks ----------
export type WeekStatus = "setup" | "open" | "locked" | "graded";

export interface Week {
  id: number;
  seasonYear: number;
  weekNumber: number;
  label: string;
  pickDeadline: string; // ISO datetime string
  moneyGameCount: number;
  status: WeekStatus;
  payoutAmount: number | null;
  payoutPaid: boolean;
}

export const insertWeekSchema = z.object({
  seasonYear: z.number().int(),
  weekNumber: z.number().int(),
  label: z.string().min(1),
  pickDeadline: z.string().min(1),
  moneyGameCount: z.number().int().optional(),
  status: z.enum(["setup", "open", "locked", "graded"]).optional(),
  payoutAmount: z.number().nullable().optional(),
  payoutPaid: z.boolean().optional(),
});
export type InsertWeek = z.infer<typeof insertWeekSchema>;

// ---------- Games ----------
export type PickType = "SU" | "ATS";
export type GameStatus = "scheduled" | "final";
export type AtsResult = "favorite" | "underdog" | "push";

export interface Game {
  id: number;
  weekId: number;
  sourceFixtureId: string | null;
  awayTeam: string;
  homeTeam: string;
  awayRank: number | null;
  homeRank: number | null;
  favoriteTeam: string;
  spread: number; // absolute points favorite is favored by
  kickoff: string; // ISO datetime string
  broadcast: string | null;
  pickType: PickType;
  isSelected: boolean;
  sortOrder: number;
  status: GameStatus;
  awayScore: number | null;
  homeScore: number | null;
  winner: string | null;
  atsResult: AtsResult | null;
  isMoneyGame: boolean;
}

export const insertGameSchema = z.object({
  weekId: z.number().int(),
  sourceFixtureId: z.string().nullable().optional(),
  awayTeam: z.string().min(1),
  homeTeam: z.string().min(1),
  awayRank: z.number().int().nullable().optional(),
  homeRank: z.number().int().nullable().optional(),
  favoriteTeam: z.string().min(1),
  spread: z.number(),
  kickoff: z.string().min(1),
  broadcast: z.string().nullable().optional(),
  pickType: z.enum(["SU", "ATS"]),
  isSelected: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(["scheduled", "final"]).optional(),
  awayScore: z.number().int().nullable().optional(),
  homeScore: z.number().int().nullable().optional(),
  winner: z.string().nullable().optional(),
  atsResult: z.enum(["favorite", "underdog", "push"]).nullable().optional(),
  isMoneyGame: z.boolean().optional(),
});
export type InsertGame = z.infer<typeof insertGameSchema>;

// ---------- Picks ----------
export interface Pick {
  id: number;
  gameId: number;
  userId: number;
  selectedTeam: string;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  submittedAt: string;
}

export const insertPickSchema = z.object({
  gameId: z.number().int(),
  userId: z.number().int(),
  selectedTeam: z.string().min(1),
  submittedAt: z.string().min(1),
});
export type InsertPick = z.infer<typeof insertPickSchema>;

// ---------- Upset Picks (bonus weekly pick) ----------
export type UpsetResult = "pending" | "win" | "loss" | "push";

export interface UpsetPick {
  id: number;
  weekId: number;
  userId: number;
  gameId: number;
  underdogTeam: string;
  favoriteTeam: string;
  spread: number;
  result: UpsetResult;
  pointsEarned: number;
  submittedAt: string;
}

export const insertUpsetPickSchema = z.object({
  weekId: z.number().int(),
  userId: z.number().int(),
  gameId: z.number().int(),
  underdogTeam: z.string().min(1),
  favoriteTeam: z.string().min(1),
  spread: z.number(),
  submittedAt: z.string().min(1),
});
export type InsertUpsetPick = z.infer<typeof insertUpsetPickSchema>;
