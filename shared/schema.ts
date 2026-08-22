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

// ---------- Cristo-Ball (season-long preseason predictions, graded at season end) ----------
export const CRISTO_BALL_CATEGORIES = [
  { key: "sec", label: "2026 SEC Champion", points: 20, options: ["Alabama", "Georgia", "LSU", "Oklahoma", "Texas", "Someone Else"] },
  { key: "bigTen", label: "2026 Big Ten Champion", points: 20, options: ["Indiana", "Ohio State", "Oregon", "USC", "Washington", "Someone Else"] },
  { key: "acc", label: "2026 ACC Champion", points: 20, options: ["Clemson", "Florida State", "Louisville", "Miami", "SMU", "Someone Else"] },
  { key: "bigTwelve", label: "2026 Big 12 Champion", points: 20, options: ["Arizona State", "Baylor", "Kansas State", "Texas Tech", "Utah", "Someone Else"] },
  { key: "mac", label: "2026 MAC Champion", points: 20, options: ["Central Michigan", "Miami (OH)", "Ohio", "Toledo", "Western Michigan", "Someone Else"] },
  { key: "sunBelt", label: "2026 Sun Belt Champion", points: 20, options: ["Appalachian State", "Georgia Southern", "James Madison", "Marshall", "Troy", "Someone Else"] },
  { key: "aac", label: "2026 AAC Champion", points: 20, options: ["Army", "Memphis", "Navy", "Tulane", "UTSA", "Someone Else"] },
  { key: "mountainWest", label: "2026 Mountain West Champion", points: 20, options: ["Air Force", "Hawaii", "North Dakota State", "New Mexico", "UNLV", "Someone Else"] },
  { key: "cusa", label: "2026 CUSA Champion", points: 20, options: ["Delaware", "Jacksonville State", "Louisiana Tech", "Liberty", "Western Kentucky", "Someone Else"] },
] as const;
export type CristoBallCategoryKey = (typeof CRISTO_BALL_CATEGORIES)[number]["key"];

export const CRISTO_BALL_SEASON_QUESTIONS = [
  { key: "laneVsDabo", label: "Lane wins his 1st game @ LSU over Dopey Dabo", points: 10 },
  { key: "billBGirlfriend", label: "Foxy Grampa Bill B. knocks up his girlfriend", points: 10 },
  { key: "winless012", label: "A D-1 team posts a winless 0-12 record", points: 10 },
  { key: "boiseStatePac12", label: "Boise State wins the Pac-12", points: 10 },
  { key: "orgeronLsu", label: "Ed Orgeron is the LSU HC for at least 1 game", points: 10 },
  { key: "champMissedPlayoffs", label: "The national champ missed the 2025 playoffs", points: 10 },
  { key: "firstNatlChamp", label: "Someone wins their first natl champ as HC", points: 10 },
] as const;
export type CristoBallSeasonQuestionKey = (typeof CRISTO_BALL_SEASON_QUESTIONS)[number]["key"];

export const CRISTO_BALL_NATIONAL_CHAMP_POINTS = 50;
export const CRISTO_BALL_PLAYOFF_TEAM_COUNT = 12;
export const CRISTO_BALL_PLAYOFF_TEAM_POINTS = 10;

export interface CristoBallPointsBreakdown {
  conferencePoints: Record<string, number>;
  seasonAnswerPoints: Record<string, number>;
  nationalChampPoints: number;
  playoffPoints: number;
}

export interface CristoBallEntry {
  id: number;
  userId: number;
  seasonYear: number;
  picks: Partial<Record<CristoBallCategoryKey, string>>;
  seasonAnswers: Partial<Record<CristoBallSeasonQuestionKey, boolean | null>>;
  nationalChampPick: string | null;
  playoffPicks: string[];
  tiebreakerGuess: number | null;
  pointsEarned: number | null;
  pointsBreakdown: CristoBallPointsBreakdown | null;
  submittedAt: string;
  updatedAt: string;
}

export const insertCristoBallEntrySchema = z.object({
  seasonYear: z.number().int(),
  picks: z.record(z.string(), z.string()).optional(),
  seasonAnswers: z.record(z.string(), z.boolean().nullable()).optional(),
  nationalChampPick: z.string().nullable().optional(),
  playoffPicks: z.array(z.string()).max(CRISTO_BALL_PLAYOFF_TEAM_COUNT).optional(),
  tiebreakerGuess: z.number().int().nullable().optional(),
});
export type InsertCristoBallEntry = z.infer<typeof insertCristoBallEntrySchema>;

export interface CristoBallResults {
  id: number;
  seasonYear: number;
  actualPicks: Partial<Record<CristoBallCategoryKey, string>>;
  actualSeasonAnswers: Partial<Record<CristoBallSeasonQuestionKey, boolean | null>>;
  actualNationalChamp: string | null;
  actualPlayoffTeams: string[];
  actualTiebreaker: number | null;
  gradedAt: string | null;
}

export const insertCristoBallResultsSchema = z.object({
  seasonYear: z.number().int(),
  actualPicks: z.record(z.string(), z.string().nullable()).optional(),
  actualSeasonAnswers: z.record(z.string(), z.boolean().nullable()).optional(),
  actualNationalChamp: z.string().nullable().optional(),
  actualPlayoffTeams: z.array(z.string()).max(CRISTO_BALL_PLAYOFF_TEAM_COUNT).optional(),
  actualTiebreaker: z.number().int().nullable().optional(),
});
export type InsertCristoBallResults = z.infer<typeof insertCristoBallResultsSchema>;
