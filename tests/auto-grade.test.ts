import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, fake, game, pick, resetDb, week } from "./fake-storage";

vi.mock("../server/storage", () => ({ storage: fake }));
const { runAutoGrade } = await import("../server/auto-grade");

const H = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const espnEvent = (away: string, home: string, as: number, hs: number, state: string) => ({
  id: `${away}-${home}`,
  date: iso(Date.now()),
  status: { type: { completed: state === "post", state, shortDetail: state === "post" ? "Final" : "Q3" } },
  competitions: [{ competitors: [{ homeAway: "away", score: String(as), team: { location: away } }, { homeAway: "home", score: String(hs), team: { location: home } }] }],
});

beforeEach(() => {
  resetDb();
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    // Next-week setup also calls ESPN; returning no events keeps it from creating a week.
    json: async () => ({
      events: url.includes("scoreboard")
        ? [espnEvent("Georgia", "Florida", 24, 20, "post"), espnEvent("Ohio State", "Penn State", 14, 17, "in"), espnEvent("Texas", "Oklahoma", 10, 35, "post")]
        : [],
    }),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("runAutoGrade", () => {
  it("saves final scores, grades locked weeks, and never overwrites hand-entered scores", async () => {
    const now = Date.now();
    week({ id: 1, pickDeadline: iso(now - 5 * H) }); // locked
    game({ id: 10, weekId: 1, awayTeam: "Georgia", homeTeam: "Florida", favoriteTeam: "Georgia", spread: 7.5, kickoff: iso(now - 4 * H), isMoneyGame: true });
    game({ id: 11, weekId: 1, awayTeam: "Ohio State", homeTeam: "Penn State", favoriteTeam: "Ohio State", spread: 3, kickoff: iso(now - H) });
    // Hand-entered final that ESPN disagrees with.
    game({ id: 12, weekId: 1, awayTeam: "Texas", homeTeam: "Oklahoma", favoriteTeam: "Texas", spread: 2.5, kickoff: iso(now - 4 * H), status: "final", awayScore: 30, homeScore: 20 });
    pick({ id: 1, gameId: 10, userId: 1, selectedTeam: "Florida" });
    pick({ id: 2, gameId: 12, userId: 1, selectedTeam: "Texas" });

    await runAutoGrade();
    const g = (id: number) => db.games.find((x) => x.id === id)!;
    expect(g(10)).toMatchObject({ status: "final", awayScore: 24, homeScore: 20, atsResult: "underdog" });
    expect(g(11).status).toBe("scheduled"); // still in progress
    expect(g(12)).toMatchObject({ awayScore: 30, homeScore: 20 }); // hand-entered score kept
    expect(db.picks.find((p) => p.id === 1)).toMatchObject({ isCorrect: true, pointsEarned: 2 });
    expect(db.picks.find((p) => p.id === 2)).toMatchObject({ isCorrect: true, pointsEarned: 1 });
  });

  it("saves scores but doesn't grade while the week's picks are still open", async () => {
    const now = Date.now();
    week({ id: 2, pickDeadline: iso(now + 48 * H) }); // still open (e.g. a Thursday game)
    game({ id: 20, weekId: 2, awayTeam: "Georgia", homeTeam: "Florida", favoriteTeam: "Georgia", spread: 7.5, kickoff: iso(now - 4 * H) });
    pick({ id: 3, gameId: 20, userId: 1, selectedTeam: "Florida" });
    await runAutoGrade();
    expect(db.games[0].status).toBe("final");
    expect(db.games[0].atsResult).toBeNull();
    expect(db.picks[0].isCorrect).toBeNull();
  });
});
