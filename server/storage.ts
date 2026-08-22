import type {
  User,
  InsertUser,
  Week,
  InsertWeek,
  Game,
  InsertGame,
  Pick,
  InsertPick,
  UpsetPick,
  InsertUpsetPick,
  CristoBallEntry,
  InsertCristoBallEntry,
  CristoBallResults,
  InsertCristoBallResults,
} from "@shared/schema";
import supabase from "./supabase";

// ---------- camelCase <-> snake_case mapping helpers ----------

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function rowToCamel<T>(row: Record<string, any> | null): T | undefined {
  if (!row) return undefined;
  const result: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    result[toCamelCase(key)] = row[key];
  }
  return result as T;
}

function rowsToCamel<T>(rows: Record<string, any>[] | null): T[] {
  if (!rows) return [];
  return rows.map((r) => rowToCamel<T>(r)!);
}

function objectToSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      result[toSnakeCase(key)] = obj[key];
    }
  }
  return result;
}

function assertNoError(error: any, context: string) {
  if (error) {
    throw new Error(`Supabase error in ${context}: ${error.message}`);
  }
}

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
  deleteWeek(id: number): Promise<void>;

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

  // cristo-ball
  getCristoBallEntry(userId: number, seasonYear: number): Promise<CristoBallEntry | undefined>;
  listCristoBallEntries(seasonYear: number): Promise<CristoBallEntry[]>;
  upsertCristoBallEntry(entry: InsertCristoBallEntry & { userId: number }): Promise<CristoBallEntry>;
  updateCristoBallEntry(id: number, fields: Partial<CristoBallEntry>): Promise<CristoBallEntry | undefined>;
  getCristoBallResults(seasonYear: number): Promise<CristoBallResults | undefined>;
  upsertCristoBallResults(results: InsertCristoBallResults): Promise<CristoBallResults>;
  markCristoBallGraded(seasonYear: number, gradedAt: string): Promise<CristoBallResults>;
}

export class DatabaseStorage implements IStorage {
  // ---------- users ----------
  async getUser(id: number): Promise<User | undefined> {
    const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    assertNoError(error, "getUser");
    return rowToCamel<User>(data);
  }
  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    assertNoError(error, "getUserByEmail");
    return rowToCamel<User>(data);
  }
  async getUserByToken(token: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("auth_token", token)
      .maybeSingle();
    assertNoError(error, "getUserByToken");
    return rowToCamel<User>(data);
  }
  async createUser(user: InsertUser): Promise<User> {
    const payload = objectToSnake({ ...user, email: user.email.toLowerCase().trim() });
    const { data, error } = await supabase.from("users").insert(payload).select().single();
    assertNoError(error, "createUser");
    return rowToCamel<User>(data)!;
  }
  async listUsers(): Promise<User[]> {
    const { data, error } = await supabase.from("users").select("*").order("name", { ascending: true });
    assertNoError(error, "listUsers");
    return rowsToCamel<User>(data);
  }
  async updateUser(id: number, fields: Partial<User>): Promise<User | undefined> {
    const payload = objectToSnake(fields);
    const { data, error } = await supabase.from("users").update(payload).eq("id", id).select().maybeSingle();
    assertNoError(error, "updateUser");
    return rowToCamel<User>(data);
  }
  async deleteUser(id: number): Promise<void> {
    const { error } = await supabase.from("users").delete().eq("id", id);
    assertNoError(error, "deleteUser");
  }

  // ---------- weeks ----------
  async listWeeks(): Promise<Week[]> {
    const { data, error } = await supabase
      .from("weeks")
      .select("*")
      .order("season_year", { ascending: false })
      .order("week_number", { ascending: false });
    assertNoError(error, "listWeeks");
    return rowsToCamel<Week>(data);
  }
  async getWeek(id: number): Promise<Week | undefined> {
    const { data, error } = await supabase.from("weeks").select("*").eq("id", id).maybeSingle();
    assertNoError(error, "getWeek");
    return rowToCamel<Week>(data);
  }
  async createWeek(week: InsertWeek): Promise<Week> {
    const payload = objectToSnake(week);
    const { data, error } = await supabase.from("weeks").insert(payload).select().single();
    assertNoError(error, "createWeek");
    return rowToCamel<Week>(data)!;
  }
  async updateWeek(id: number, fields: Partial<Week>): Promise<Week | undefined> {
    const payload = objectToSnake(fields);
    const { data, error } = await supabase.from("weeks").update(payload).eq("id", id).select().maybeSingle();
    assertNoError(error, "updateWeek");
    return rowToCamel<Week>(data);
  }
  async deleteWeek(id: number): Promise<void> {
    // Cascade manually: picks reference games (not weeks directly), so resolve
    // this week's game IDs first, then delete picks -> upset_picks -> games -> week.
    const gameIds = await this.gameIdsForWeek(id);
    if (gameIds.length > 0) {
      const { error: picksError } = await supabase.from("picks").delete().in("game_id", gameIds);
      assertNoError(picksError, "deleteWeek(picks)");
    }
    const { error: upsetError } = await supabase.from("upset_picks").delete().eq("week_id", id);
    assertNoError(upsetError, "deleteWeek(upset_picks)");
    const { error: gamesError } = await supabase.from("games").delete().eq("week_id", id);
    assertNoError(gamesError, "deleteWeek(games)");
    const { error: weekError } = await supabase.from("weeks").delete().eq("id", id);
    assertNoError(weekError, "deleteWeek(week)");
  }

  // ---------- games ----------
  async listGamesByWeek(weekId: number): Promise<Game[]> {
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("week_id", weekId)
      .order("sort_order", { ascending: true })
      .order("kickoff", { ascending: true });
    assertNoError(error, "listGamesByWeek");
    return rowsToCamel<Game>(data);
  }
  async getGame(id: number): Promise<Game | undefined> {
    const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
    assertNoError(error, "getGame");
    return rowToCamel<Game>(data);
  }
  async createGame(game: InsertGame): Promise<Game> {
    const payload = objectToSnake(game);
    const { data, error } = await supabase.from("games").insert(payload).select().single();
    assertNoError(error, "createGame");
    return rowToCamel<Game>(data)!;
  }
  async createGames(gameList: InsertGame[]): Promise<Game[]> {
    if (gameList.length === 0) return [];
    const payload = gameList.map((g) => objectToSnake(g));
    const { data, error } = await supabase.from("games").insert(payload).select();
    assertNoError(error, "createGames");
    return rowsToCamel<Game>(data);
  }
  async updateGame(id: number, fields: Partial<Game>): Promise<Game | undefined> {
    const payload = objectToSnake(fields);
    const { data, error } = await supabase.from("games").update(payload).eq("id", id).select().maybeSingle();
    assertNoError(error, "updateGame");
    return rowToCamel<Game>(data);
  }
  async deleteGame(id: number): Promise<void> {
    const { error } = await supabase.from("games").delete().eq("id", id);
    assertNoError(error, "deleteGame");
  }

  // ---------- picks ----------
  async listPicksByWeek(weekId: number): Promise<Pick[]> {
    const gameIds = await this.gameIdsForWeek(weekId);
    if (gameIds.length === 0) return [];
    const { data, error } = await supabase.from("picks").select("*").in("game_id", gameIds);
    assertNoError(error, "listPicksByWeek");
    return rowsToCamel<Pick>(data);
  }
  async listPicksByUser(userId: number, weekId: number): Promise<Pick[]> {
    const gameIds = await this.gameIdsForWeek(weekId);
    if (gameIds.length === 0) return [];
    const { data, error } = await supabase
      .from("picks")
      .select("*")
      .eq("user_id", userId)
      .in("game_id", gameIds);
    assertNoError(error, "listPicksByUser");
    return rowsToCamel<Pick>(data);
  }
  async getPick(gameId: number, userId: number): Promise<Pick | undefined> {
    const { data, error } = await supabase
      .from("picks")
      .select("*")
      .eq("game_id", gameId)
      .eq("user_id", userId)
      .maybeSingle();
    assertNoError(error, "getPick");
    return rowToCamel<Pick>(data);
  }
  async upsertPick(pick: InsertPick): Promise<Pick> {
    const existing = await this.getPick(pick.gameId, pick.userId);
    if (existing) {
      const { data, error } = await supabase
        .from("picks")
        .update({ selected_team: pick.selectedTeam, submitted_at: pick.submittedAt })
        .eq("id", existing.id)
        .select()
        .single();
      assertNoError(error, "upsertPick(update)");
      return rowToCamel<Pick>(data)!;
    }
    const payload = objectToSnake(pick);
    const { data, error } = await supabase.from("picks").insert(payload).select().single();
    assertNoError(error, "upsertPick(insert)");
    return rowToCamel<Pick>(data)!;
  }
  async updatePick(id: number, fields: Partial<Pick>): Promise<Pick | undefined> {
    const payload = objectToSnake(fields);
    const { data, error } = await supabase.from("picks").update(payload).eq("id", id).select().maybeSingle();
    assertNoError(error, "updatePick");
    return rowToCamel<Pick>(data);
  }

  // ---------- upset picks ----------
  async getUpsetPick(weekId: number, userId: number): Promise<UpsetPick | undefined> {
    const { data, error } = await supabase
      .from("upset_picks")
      .select("*")
      .eq("week_id", weekId)
      .eq("user_id", userId)
      .maybeSingle();
    assertNoError(error, "getUpsetPick");
    return rowToCamel<UpsetPick>(data);
  }
  async listUpsetPicksByWeek(weekId: number): Promise<UpsetPick[]> {
    const { data, error } = await supabase.from("upset_picks").select("*").eq("week_id", weekId);
    assertNoError(error, "listUpsetPicksByWeek");
    return rowsToCamel<UpsetPick>(data);
  }
  async upsertUpsetPick(pick: InsertUpsetPick): Promise<UpsetPick> {
    const existing = await this.getUpsetPick(pick.weekId, pick.userId);
    if (existing) {
      const { data, error } = await supabase
        .from("upset_picks")
        .update({
          game_id: pick.gameId,
          underdog_team: pick.underdogTeam,
          favorite_team: pick.favoriteTeam,
          spread: pick.spread,
          submitted_at: pick.submittedAt,
        })
        .eq("id", existing.id)
        .select()
        .single();
      assertNoError(error, "upsertUpsetPick(update)");
      return rowToCamel<UpsetPick>(data)!;
    }
    const payload = objectToSnake(pick);
    const { data, error } = await supabase.from("upset_picks").insert(payload).select().single();
    assertNoError(error, "upsertUpsetPick(insert)");
    return rowToCamel<UpsetPick>(data)!;
  }
  async updateUpsetPick(id: number, fields: Partial<UpsetPick>): Promise<UpsetPick | undefined> {
    const payload = objectToSnake(fields);
    const { data, error } = await supabase
      .from("upset_picks")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();
    assertNoError(error, "updateUpsetPick");
    return rowToCamel<UpsetPick>(data);
  }

  // ---------- cristo-ball ----------
  async getCristoBallEntry(userId: number, seasonYear: number): Promise<CristoBallEntry | undefined> {
    const { data, error } = await supabase
      .from("cristo_ball_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("season_year", seasonYear)
      .maybeSingle();
    assertNoError(error, "getCristoBallEntry");
    return rowToCamel<CristoBallEntry>(data);
  }
  async listCristoBallEntries(seasonYear: number): Promise<CristoBallEntry[]> {
    const { data, error } = await supabase
      .from("cristo_ball_entries")
      .select("*")
      .eq("season_year", seasonYear);
    assertNoError(error, "listCristoBallEntries");
    return rowsToCamel<CristoBallEntry>(data);
  }
  async upsertCristoBallEntry(entry: InsertCristoBallEntry & { userId: number }): Promise<CristoBallEntry> {
    const existing = await this.getCristoBallEntry(entry.userId, entry.seasonYear);
    const now = new Date().toISOString();
    if (existing) {
      const payload = objectToSnake({
        picks: entry.picks ?? existing.picks,
        seasonAnswers: entry.seasonAnswers ?? existing.seasonAnswers,
        nationalChampPick: entry.nationalChampPick ?? existing.nationalChampPick,
        playoffPicks: entry.playoffPicks ?? existing.playoffPicks,
        tiebreakerGuess: entry.tiebreakerGuess ?? existing.tiebreakerGuess,
        updatedAt: now,
      });
      const { data, error } = await supabase
        .from("cristo_ball_entries")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      assertNoError(error, "upsertCristoBallEntry(update)");
      return rowToCamel<CristoBallEntry>(data)!;
    }
    const payload = objectToSnake({
      userId: entry.userId,
      seasonYear: entry.seasonYear,
      picks: entry.picks ?? {},
      seasonAnswers: entry.seasonAnswers ?? {},
      nationalChampPick: entry.nationalChampPick ?? null,
      playoffPicks: entry.playoffPicks ?? [],
      tiebreakerGuess: entry.tiebreakerGuess ?? null,
      submittedAt: now,
      updatedAt: now,
    });
    const { data, error } = await supabase.from("cristo_ball_entries").insert(payload).select().single();
    assertNoError(error, "upsertCristoBallEntry(insert)");
    return rowToCamel<CristoBallEntry>(data)!;
  }
  async updateCristoBallEntry(id: number, fields: Partial<CristoBallEntry>): Promise<CristoBallEntry | undefined> {
    const payload = objectToSnake(fields);
    const { data, error } = await supabase
      .from("cristo_ball_entries")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();
    assertNoError(error, "updateCristoBallEntry");
    return rowToCamel<CristoBallEntry>(data);
  }
  async getCristoBallResults(seasonYear: number): Promise<CristoBallResults | undefined> {
    const { data, error } = await supabase
      .from("cristo_ball_results")
      .select("*")
      .eq("season_year", seasonYear)
      .maybeSingle();
    assertNoError(error, "getCristoBallResults");
    return rowToCamel<CristoBallResults>(data);
  }
  async upsertCristoBallResults(results: InsertCristoBallResults): Promise<CristoBallResults> {
    const existing = await this.getCristoBallResults(results.seasonYear);
    if (existing) {
      const payload = objectToSnake({
        actualPicks: results.actualPicks ?? existing.actualPicks,
        actualSeasonAnswers: results.actualSeasonAnswers ?? existing.actualSeasonAnswers,
        actualNationalChamp: results.actualNationalChamp ?? existing.actualNationalChamp,
        actualPlayoffTeams: results.actualPlayoffTeams ?? existing.actualPlayoffTeams,
        actualTiebreaker: results.actualTiebreaker ?? existing.actualTiebreaker,
      });
      const { data, error } = await supabase
        .from("cristo_ball_results")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      assertNoError(error, "upsertCristoBallResults(update)");
      return rowToCamel<CristoBallResults>(data)!;
    }
    const payload = objectToSnake({
      seasonYear: results.seasonYear,
      actualPicks: results.actualPicks ?? {},
      actualSeasonAnswers: results.actualSeasonAnswers ?? {},
      actualNationalChamp: results.actualNationalChamp ?? null,
      actualPlayoffTeams: results.actualPlayoffTeams ?? [],
      actualTiebreaker: results.actualTiebreaker ?? null,
    });
    const { data, error } = await supabase.from("cristo_ball_results").insert(payload).select().single();
    assertNoError(error, "upsertCristoBallResults(insert)");
    return rowToCamel<CristoBallResults>(data)!;
  }
  async markCristoBallGraded(seasonYear: number, gradedAt: string): Promise<CristoBallResults> {
    const existing = await this.getCristoBallResults(seasonYear);
    if (!existing) {
      const { data, error } = await supabase
        .from("cristo_ball_results")
        .insert(objectToSnake({ seasonYear, actualPicks: {}, actualSeasonAnswers: {}, actualPlayoffTeams: [], gradedAt }))
        .select()
        .single();
      assertNoError(error, "markCristoBallGraded(insert)");
      return rowToCamel<CristoBallResults>(data)!;
    }
    const { data, error } = await supabase
      .from("cristo_ball_results")
      .update({ graded_at: gradedAt })
      .eq("id", existing.id)
      .select()
      .single();
    assertNoError(error, "markCristoBallGraded(update)");
    return rowToCamel<CristoBallResults>(data)!;
  }

  // ---------- helpers ----------
  private async gameIdsForWeek(weekId: number): Promise<number[]> {
    const { data, error } = await supabase.from("games").select("id").eq("week_id", weekId);
    assertNoError(error, "gameIdsForWeek");
    return (data ?? []).map((r: { id: number }) => r.id);
  }
}

export const storage = new DatabaseStorage();
