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
  { key: "georgiaDrivingViolation", label: "Will a Georgia player have a mid-season driving violation or accident?", points: 5 },
  { key: "power4CoachFired", label: "Will a Power 4 coach be fired before November?", points: 5 },
  { key: "secCfpChampGame", label: "Will an SEC team make the CFP National Championship game?", points: 5 },
  { key: "kiffinTenWins", label: "Will Lane Kiffin lead LSU to 10+ wins in his first season?", points: 5 },
  { key: "lsuOleMissFight", label: "Will there be a fight during the LSU-Ole Miss game (players or coaches)?", points: 5 },
  { key: "uncWinningRecord", label: "Will Bill Belichick's UNC team finish with a winning record?", points: 5 },
  { key: "archManningHeisman", label: "Will Arch Manning finish as a Heisman finalist?", points: 5 },
  { key: "pac12Top25", label: "Will the relaunched Pac-12 have a team finish ranked in the AP Top 25?", points: 5 },
  { key: "top10sMissPlayoff", label: "Will at least 3 preseason AP Top 10 teams miss the playoff entirely?", points: 5 },
  { key: "mcafeeSuspended", label: "Will Pat McAfee get suspended from GameDay for at least one week?", points: 5 },
  { key: "nonQbHeisman", label: "Will a non-quarterback (RB, WR, or defensive player) win the Heisman Trophy?", points: 5 },
  { key: "rivalryCloseGame", label: "Will any of these rivalry games (Ohio State-Michigan, Texas-Oklahoma, Auburn-Alabama, Army-Navy) be decided by 3 points or less?", points: 5 },
  { key: "freshmanRbWrLeadsYards", label: "Will a true freshman running back or receiver lead a Power 4 team in yards from scrimmage?", points: 5 },
] as const;
export type CristoBallSeasonQuestionKey = (typeof CRISTO_BALL_SEASON_QUESTIONS)[number]["key"];

export const CRISTO_BALL_CHOICE_QUESTIONS = [
  {
    key: "firstArrestConference",
    label: "Which conference will have the first arrested player?",
    points: 5,
    options: ["SEC", "Big Ten", "ACC", "Big 12", "Other"],
  },
] as const;
export type CristoBallChoiceQuestionKey = (typeof CRISTO_BALL_CHOICE_QUESTIONS)[number]["key"];

export const CRISTO_BALL_WIN_TOTALS = [
  { key: "oklahoma", team: "Oklahoma", line: 8.5, points: 2 },
  { key: "southCarolina", team: "South Carolina", line: 6.5, points: 2 },
  { key: "texas", team: "Texas", line: 9.5, points: 2 },
  { key: "maryland", team: "Maryland", line: 5.5, points: 2 },
  { key: "indiana", team: "Indiana", line: 10.5, points: 2 },
  { key: "ncState", team: "NC State", line: 7.5, points: 2 },
  { key: "virginiaTech", team: "Virginia Tech", line: 7.5, points: 2 },
  { key: "westVirginia", team: "West Virginia", line: 7.5, points: 2 },
  { key: "army", team: "Army", line: 7.5, points: 2 },
  { key: "navy", team: "Navy", line: 8.5, points: 2 },
  { key: "airForce", team: "Air Force", line: 7.5, points: 2 },
  { key: "notreDame", team: "Notre Dame", line: 10.5, points: 2 },
] as const;
export type CristoBallWinTotalKey = (typeof CRISTO_BALL_WIN_TOTALS)[number]["key"];
export type CristoBallWinTotalPick = "over" | "under";

export const CRISTO_BALL_NATIONAL_CHAMP_POINTS = 50;
export const CRISTO_BALL_PLAYOFF_TEAM_COUNT = 12;
export const CRISTO_BALL_PLAYOFF_TEAM_POINTS = 10;

export interface CristoBallPointsBreakdown {
  conferencePoints: Record<string, number>;
  seasonAnswerPoints: Record<string, number>;
  choicePoints: Record<string, number>;
  winTotalPoints: Record<string, number>;
  nationalChampPoints: number;
  playoffPoints: number;
}

export interface CristoBallEntry {
  id: number;
  userId: number;
  seasonYear: number;
  picks: Partial<Record<CristoBallCategoryKey, string>>;
  seasonAnswers: Partial<Record<CristoBallSeasonQuestionKey, boolean | null>>;
  choicePicks: Partial<Record<CristoBallChoiceQuestionKey, string>>;
  winTotalPicks: Partial<Record<CristoBallWinTotalKey, CristoBallWinTotalPick>>;
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
  choicePicks: z.record(z.string(), z.string()).optional(),
  winTotalPicks: z.record(z.string(), z.enum(["over", "under"])).optional(),
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
  actualChoicePicks: Partial<Record<CristoBallChoiceQuestionKey, string>>;
  actualWinTotals: Partial<Record<CristoBallWinTotalKey, number>>;
  actualNationalChamp: string | null;
  actualPlayoffTeams: string[];
  actualTiebreaker: number | null;
  gradedAt: string | null;
}

export const insertCristoBallResultsSchema = z.object({
  seasonYear: z.number().int(),
  actualPicks: z.record(z.string(), z.string().nullable()).optional(),
  actualSeasonAnswers: z.record(z.string(), z.boolean().nullable()).optional(),
  actualChoicePicks: z.record(z.string(), z.string().nullable()).optional(),
  actualWinTotals: z.record(z.string(), z.number().nullable()).optional(),
  actualNationalChamp: z.string().nullable().optional(),
  actualPlayoffTeams: z.array(z.string()).max(CRISTO_BALL_PLAYOFF_TEAM_COUNT).optional(),
  actualTiebreaker: z.number().int().nullable().optional(),
});
export type InsertCristoBallResults = z.infer<typeof insertCristoBallResultsSchema>;
