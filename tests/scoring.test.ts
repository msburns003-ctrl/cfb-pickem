import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, fake, game, pick, resetDb, user, week } from "./fake-storage";

vi.mock("../server/storage", () => ({ storage: fake }));
const { ATS_THRESHOLD, computePickType, computeSeasonStats, computeStandings, gradeCompletedGames } = await import("../server/scoring");

beforeEach(resetDb);

describe("computePickType (league rule: ATS when abs(spread) > 5.5)", () => {
  it("keeps the threshold at 5.5", () => expect(ATS_THRESHOLD).toBe(5.5));
  it.each([
    [5.5, "SU"],
    [-5.5, "SU"],
    [6, "ATS"],
    [-6, "ATS"],
    [0, "SU"],
  ])("spread %s is %s", (spread, type) => expect(computePickType(spread)).toBe(type));
});

describe("gradeCompletedGames", () => {
  function setup() {
    week({ id: 1 });
    // Georgia -7.5 wins by 4: underdog Florida covers. Money game.
    game({ id: 10, weekId: 1, awayTeam: "Georgia", homeTeam: "Florida", favoriteTeam: "Georgia", spread: 7.5, status: "final", awayScore: 24, homeScore: 20, isMoneyGame: true });
    // Straight up: Penn State wins.
    game({ id: 11, weekId: 1, awayTeam: "Ohio State", homeTeam: "Penn State", favoriteTeam: "Ohio State", spread: 3, status: "final", awayScore: 14, homeScore: 17 });
    // Lands exactly on the spread: push.
    game({ id: 12, weekId: 1, awayTeam: "Texas", homeTeam: "Oklahoma", favoriteTeam: "Texas", spread: 7, status: "final", awayScore: 27, homeScore: 20 });
    // Not final yet.
    game({ id: 13, weekId: 1, awayTeam: "Utah", homeTeam: "BYU", favoriteTeam: "Utah", spread: 2.5 });
    pick({ id: 1, gameId: 10, userId: 1, selectedTeam: "Florida" });
    pick({ id: 2, gameId: 10, userId: 2, selectedTeam: "Georgia" });
    pick({ id: 3, gameId: 11, userId: 1, selectedTeam: "Penn State" });
    pick({ id: 4, gameId: 12, userId: 1, selectedTeam: "Texas" });
    pick({ id: 5, gameId: 12, userId: 2, selectedTeam: "Oklahoma" });
    pick({ id: 6, gameId: 13, userId: 1, selectedTeam: "Utah" });
  }
  const p = (id: number) => db.picks.find((x) => x.id === id)!;

  it("scores ATS, money games, straight-up games and pushes", async () => {
    setup();
    const result = await gradeCompletedGames(1);
    expect(p(1)).toMatchObject({ isCorrect: true, pointsEarned: 2 }); // covering dog in a money game
    expect(p(2)).toMatchObject({ isCorrect: false, pointsEarned: 0 });
    expect(p(3)).toMatchObject({ isCorrect: true, pointsEarned: 1 });
    expect(p(4)).toMatchObject({ isCorrect: false, pointsEarned: 0 }); // push earns nobody points
    expect(p(5)).toMatchObject({ isCorrect: false, pointsEarned: 0 });
    expect(p(6)).toMatchObject({ isCorrect: null, pointsEarned: null }); // game not final
    expect(result.pendingGameIds).toEqual([13]);
    expect(result.weekFullyGraded).toBe(false);
    expect(db.weeks[0].status).toBe("open");
  });

  it("marks the week graded once every selected game is final", async () => {
    setup();
    Object.assign(db.games.find((g) => g.id === 13)!, { status: "final", awayScore: 30, homeScore: 10 });
    const result = await gradeCompletedGames(1);
    expect(result.weekFullyGraded).toBe(true);
    expect(db.weeks[0].status).toBe("graded");
  });

  it("grades upset picks: points only when the underdog wins outright", async () => {
    setup();
    game({ id: 20, weekId: 1, awayTeam: "Navy", homeTeam: "Army", favoriteTeam: "Army", spread: 9, isSelected: false, status: "final", awayScore: 21, homeScore: 17 });
    game({ id: 21, weekId: 1, awayTeam: "Duke", homeTeam: "Clemson", favoriteTeam: "Clemson", spread: 16, isSelected: false, status: "final", awayScore: 10, homeScore: 24 });
    db.upsets.push(
      { id: 1, weekId: 1, userId: 1, gameId: 20, underdogTeam: "Navy", favoriteTeam: "Army", spread: 9, result: "pending", pointsEarned: 0, submittedAt: "" },
      { id: 2, weekId: 1, userId: 2, gameId: 21, underdogTeam: "Duke", favoriteTeam: "Clemson", spread: 16, result: "pending", pointsEarned: 0, submittedAt: "" },
    );
    await gradeCompletedGames(1);
    expect(db.upsets[0]).toMatchObject({ result: "win", pointsEarned: 2 });
    expect(db.upsets[1]).toMatchObject({ result: "loss", pointsEarned: 0 });
  });

  it("refuses to grade when no selected game is final", async () => {
    week({ id: 2 });
    game({ id: 30, weekId: 2, awayTeam: "A", homeTeam: "B", favoriteTeam: "A", spread: 3 });
    await expect(gradeCompletedGames(2)).rejects.toThrow(/No selected games/);
  });
});

describe("standings and season stats", () => {
  function setup() {
    ["Ann", "Bob", "Cat"].forEach((name, i) => user({ id: i + 1, name }));
    week({ id: 1, status: "graded" });
    game({ id: 10, weekId: 1, awayTeam: "A", homeTeam: "B", favoriteTeam: "A", spread: 3, status: "final", awayScore: 20, homeScore: 10, atsResult: "favorite" });
    game({ id: 11, weekId: 1, awayTeam: "C", homeTeam: "D", favoriteTeam: "C", spread: 7, status: "final", awayScore: 27, homeScore: 20, atsResult: "push", pickType: "ATS" });
    pick({ id: 1, gameId: 10, userId: 1, selectedTeam: "A", isCorrect: true, pointsEarned: 1 });
    pick({ id: 2, gameId: 10, userId: 2, selectedTeam: "A", isCorrect: true, pointsEarned: 1 });
    pick({ id: 3, gameId: 10, userId: 3, selectedTeam: "B", isCorrect: false, pointsEarned: 0 });
    pick({ id: 4, gameId: 11, userId: 1, selectedTeam: "C", isCorrect: false, pointsEarned: 0 });
  }

  it("gives tied members the same rank (league rule: no tiebreaker)", async () => {
    setup();
    const rows = await computeStandings();
    const rank = (name: string) => rows.find((r) => r.name === name)!.rank;
    expect(rank("Ann")).toBe(1);
    expect(rank("Bob")).toBe(1);
    expect(rank("Cat")).toBe(3);
  });

  it("counts a weekly tie for the top score as a push, not a win", async () => {
    setup();
    const stats = await computeSeasonStats();
    const ann = stats.members.find((m) => m.name === "Ann")!;
    expect(ann.weeklyWins).toBe(0);
    expect(ann.weeklyPushes).toBe(1);
    // A pick on a game that landed on the spread is a push in records.
    expect(ann.overall).toEqual({ wins: 1, losses: 0, pushes: 1 });
    expect(stats.weeks[0].leagueAverage).toBe(0.7);
  });
});
