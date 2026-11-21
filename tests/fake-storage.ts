// In-memory stand-in for server/storage.ts so tests never touch Supabase.
// Tests mock "../server/storage" with `fake` and fill `db` directly.
import type { CristoBallEntry, CristoBallResults, Game, Pick, UpsetPick, User, Week } from "@shared/schema";

export const db = {
  users: [] as User[],
  weeks: [] as Week[],
  games: [] as Game[],
  picks: [] as Pick[],
  upsets: [] as UpsetPick[],
  cristoBallResults: undefined as CristoBallResults | undefined,
  cristoBallEntries: [] as CristoBallEntry[],
};

let nextId = 1000;

export function resetDb() {
  db.users = [];
  db.weeks = [];
  db.games = [];
  db.picks = [];
  db.upsets = [];
  db.cristoBallResults = undefined;
  db.cristoBallEntries = [];
}

function update<T extends { id: number }>(rows: T[], id: number, fields: Partial<T>): T | undefined {
  const row = rows.find((r) => r.id === id);
  if (row) Object.assign(row, fields);
  return row;
}

const gameIdsOfWeek = (weekId: number) => new Set(db.games.filter((g) => g.weekId === weekId).map((g) => g.id));

export const fake = {
  listUsers: async () => db.users.map((u) => ({ ...u })),
  getUserByEmail: async (email: string) => db.users.find((u) => u.email === email),
  getUserByToken: async (token: string) => db.users.find((u) => !!token && u.authToken === token),
  getUser: async (id: number) => db.users.find((u) => u.id === id),
  updateUser: async (id: number, fields: Partial<User>) => update(db.users, id, fields),

  listWeeks: async () => [...db.weeks].sort((a, b) => b.seasonYear - a.seasonYear || b.weekNumber - a.weekNumber),
  getWeek: async (id: number) => db.weeks.find((w) => w.id === id),
  createWeek: async (week: Partial<Week>) => {
    const created = { id: nextId++, moneyGameCount: 2, status: "setup", payoutAmount: null, payoutPaid: false, moneyGamesAssigned: false, ...week } as Week;
    db.weeks.push(created);
    return created;
  },
  updateWeek: async (id: number, fields: Partial<Week>) => update(db.weeks, id, fields),

  listGamesByWeek: async (weekId: number) =>
    db.games
      .filter((g) => g.weekId === weekId)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.sortOrder - b.sortOrder)
      .map((g) => ({ ...g })),
  createGames: async (games: Partial<Game>[]) =>
    games.map((g) => {
      const created = { id: nextId++, awayScore: null, homeScore: null, winner: null, atsResult: null, isMoneyGame: false, ...g } as Game;
      db.games.push(created);
      return created;
    }),
  updateGame: async (id: number, fields: Partial<Game>) => update(db.games, id, fields),
  batchUpdateGames: async (updates: Array<{ id: number } & Partial<Game>>) => {
    updates.forEach(({ id, ...f }) => update(db.games, id, f));
  },

  listPicksByWeek: async (weekId: number) => {
    const ids = gameIdsOfWeek(weekId);
    return db.picks.filter((p) => ids.has(p.gameId)).map((p) => ({ ...p }));
  },
  listPicksByUser: async (userId: number, weekId: number) => {
    const ids = gameIdsOfWeek(weekId);
    return db.picks.filter((p) => p.userId === userId && ids.has(p.gameId));
  },
  batchUpdatePicks: async (updates: Array<{ id: number } & Partial<Pick>>) => {
    updates.forEach(({ id, ...f }) => update(db.picks, id, f));
  },

  listUpsetPicksByWeek: async (weekId: number) => db.upsets.filter((u) => u.weekId === weekId).map((u) => ({ ...u })),
  getUpsetPick: async (weekId: number, userId: number) => db.upsets.find((u) => u.weekId === weekId && u.userId === userId),
  batchUpdateUpsetPicks: async (updates: Array<{ id: number } & Partial<UpsetPick>>) => {
    updates.forEach(({ id, ...f }) => update(db.upsets, id, f));
  },

  getCristoBallResults: async () => (db.cristoBallResults ? { ...db.cristoBallResults } : undefined),
  listCristoBallEntries: async () => db.cristoBallEntries.map((e) => ({ ...e })),
};

// Builders with sensible Cristo-Ball defaults.
export function cristoBallResults(fields: Partial<CristoBallResults> & { seasonYear: number }): CristoBallResults {
  const r: CristoBallResults = {
    id: nextId++,
    actualPicks: {},
    actualSeasonAnswers: {},
    actualChoicePicks: {},
    actualWinTotals: {},
    actualNationalChamp: null,
    actualPlayoffTeams: [],
    actualHeisman: null,
    gradedAt: null,
    lockDeadline: null,
    ...fields,
  };
  db.cristoBallResults = r;
  return r;
}

export function cristoBallEntry(fields: Partial<CristoBallEntry> & { id: number; userId: number }): CristoBallEntry {
  const e: CristoBallEntry = {
    seasonYear: 2026,
    picks: {},
    seasonAnswers: {},
    choicePicks: {},
    winTotalPicks: {},
    nationalChampPick: null,
    playoffPicks: [],
    heismanPick: null,
    pointsEarned: null,
    pointsBreakdown: null,
    submittedAt: "2026-08-28T16:00:00.000Z",
    updatedAt: "2026-08-28T16:00:00.000Z",
    ...fields,
  };
  db.cristoBallEntries.push(e);
  return e;
}

export function week(fields: Partial<Week> & { id: number }): Week {
  const w: Week = {
    seasonYear: 2026,
    weekNumber: fields.id,
    label: `Week ${fields.id}`,
    pickDeadline: "2026-10-24T16:00:00.000Z",
    moneyGameCount: 1,
    status: "open",
    payoutAmount: null,
    payoutPaid: false,
    moneyGamesAssigned: true,
    ...fields,
  };
  db.weeks.push(w);
  return w;
}

export function game(fields: Partial<Game> & { id: number; weekId: number; awayTeam: string; homeTeam: string; favoriteTeam: string; spread: number }): Game {
  const g: Game = {
    sourceFixtureId: null,
    awayRank: null,
    homeRank: null,
    kickoff: "2026-10-24T19:30:00.000Z",
    broadcast: null,
    pickType: Math.abs(fields.spread) > 5.5 ? "ATS" : "SU",
    isSelected: true,
    sortOrder: fields.id,
    status: "scheduled",
    awayScore: null,
    homeScore: null,
    winner: null,
    atsResult: null,
    isMoneyGame: false,
    ...fields,
  };
  db.games.push(g);
  return g;
}

export function pick(fields: Partial<Pick> & { id: number; gameId: number; userId: number; selectedTeam: string }): Pick {
  const p: Pick = { isCorrect: null, pointsEarned: null, submittedAt: "2026-10-24T12:00:00.000Z", ...fields };
  db.picks.push(p);
  return p;
}

export function user(fields: Partial<User> & { id: number; name: string }): User {
  const u: User = {
    email: `${fields.name.toLowerCase().replace(/\s+/g, "")}@example.com`,
    passwordHash: "x:y",
    isAdmin: false,
    authToken: null,
    mustChangePassword: false,
    hiddenFromGrid: false,
    ...fields,
  };
  db.users.push(u);
  return u;
}
