import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, fake, game, pick, resetDb, week } from "./fake-storage";

vi.mock("../server/storage", () => ({ storage: fake }));
const { addDaysEastern, ensureNextWeek, fetchWeekCandidates, importEspnGamesForWeek } = await import("../server/schedule");

const team = (location: string, abbreviation: string, rank = 99) => ({ team: { location, displayName: `${location} Mascots`, abbreviation }, curatedRank: { current: rank } });
const event = (id: string, date: string, away: object, home: object, odds?: object) => ({
  id,
  date,
  competitions: [{ competitors: [{ homeAway: "away", ...away }, { homeAway: "home", ...home }], odds: odds ? [odds] : undefined, broadcasts: [{ names: ["ABC"] }] }],
});
let events: Record<string, object[]> = {};
const urls: string[] = [];

beforeEach(() => {
  resetDb();
  urls.length = 0;
  events = {
    "20261031": [
      event("g1", "2026-10-31T19:30Z", team("Georgia", "UGA", 3), team("Florida", "FLA"), { details: "UGA -7.5", spread: -7.5, awayTeamOdds: { favorite: true }, homeTeamOdds: { favorite: false } }),
      event("g2", "2026-10-31T16:00Z", team("Ohio State", "OSU", 2), team("Penn State", "PSU", 6), { details: "PSU -3" }),
      event("g3", "2026-10-31T20:00Z", team("Duke", "DUKE"), team("Clemson", "CLEM")),
      event("g4", "2026-10-31T23:00Z", team("Navy", "NAVY"), team("Army", "ARMY"), { details: "EVEN" }),
    ],
    // Tuesday night: next week's game.
    "20261103": [event("g5", "2026-11-04T00:00Z", team("Toledo", "TOL"), team("Ohio", "OHIO"), { details: "TOL -2.5" })],
  };
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    const d = new URL(url).searchParams.get("dates")!;
    return { ok: true, json: async () => ({ events: events[d] ?? [] }) };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("addDaysEastern", () => {
  it("keeps noon Eastern across both DST changes", () => {
    expect(addDaysEastern("2026-10-31T16:00:00.000Z", 7)).toBe("2026-11-07T17:00:00.000Z"); // DST ends Nov 1
    expect(addDaysEastern("2026-03-07T17:00:00.000Z", 7)).toBe("2026-03-14T16:00:00.000Z"); // DST starts Mar 8
  });
});

describe("fetchWeekCandidates", () => {
  it("reads lines from favorite flags, details text and EVEN, and keeps the week's window", async () => {
    const { candidates } = await fetchWeekCandidates("2026-10-31T16:00:00.000Z");
    const byId = Object.fromEntries(candidates.map((c) => [c.sourceFixtureId, c]));
    expect(byId.g1).toMatchObject({ awayTeam: "Georgia", awayRank: 3, homeRank: null, broadcast: "ABC", line: { favoriteTeam: "Georgia", spread: 7.5 } });
    expect(byId.g2.line).toEqual({ favoriteTeam: "Penn State", spread: 3 });
    expect(byId.g3.line).toBeNull();
    expect(byId.g4.line).toEqual({ favoriteTeam: "Army", spread: 0 });
    expect(byId.g5).toBeUndefined(); // following Tuesday belongs to next week
    expect(urls.every((u) => u.includes("groups=80"))).toBe(true);
  });
});

describe("importEspnGamesForWeek", () => {
  // Line refreshes skip games that have kicked off, so pin the clock to the
  // week before the sample games; otherwise this fails once their date passes.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("adds unselected candidates, reports missing lines, and refreshes only unpicked lines", async () => {
    week({ id: 9, pickDeadline: "2026-10-31T16:00:00.000Z", status: "setup" });
    const first = await importEspnGamesForWeek(9);
    expect(first).toMatchObject({ added: 3, refreshed: 0, totalFromEspn: 4 });
    expect(first.noLine.map((g) => g.awayTeam)).toEqual(["Duke"]);
    expect(db.games.every((g) => !g.isSelected)).toBe(true);
    expect(db.games.find((g) => g.awayTeam === "Georgia")).toMatchObject({ pickType: "ATS", spread: 7.5 });

    // Lines move; Ohio State game now has a pick.
    (events["20261031"][0] as any).competitions[0].odds = [{ details: "UGA -10", spread: -10, awayTeamOdds: { favorite: true } }];
    (events["20261031"][1] as any).competitions[0].odds = [{ details: "PSU -6.5" }];
    const osu = db.games.find((g) => g.awayTeam === "Ohio State")!;
    pick({ id: 1, gameId: osu.id, userId: 1, selectedTeam: "Penn State" });

    const second = await importEspnGamesForWeek(9);
    expect(second).toMatchObject({ added: 0, refreshed: 1, lockedByPicks: 1 });
    expect(db.games.find((g) => g.awayTeam === "Georgia")!.spread).toBe(10);
    expect(osu.spread).toBe(3); // picked: unchanged
  });

  it("recognizes a hand-entered game with home and away flipped instead of duplicating it", async () => {
    week({ id: 9, pickDeadline: "2026-10-31T16:00:00.000Z" });
    game({ id: 1, weekId: 9, awayTeam: "Army", homeTeam: "Navy", favoriteTeam: "Army", spread: 0, kickoff: "2026-10-31T23:00:00.000Z" });
    await importEspnGamesForWeek(9);
    expect(db.games.filter((g) => [g.awayTeam, g.homeTeam].includes("Navy"))).toHaveLength(1);
  });
});

describe("ensureNextWeek", () => {
  it("creates the next week in Setup once the latest week is graded", async () => {
    week({ id: 8, weekNumber: 8, pickDeadline: "2026-10-24T16:00:00.000Z", status: "graded", moneyGameCount: 3 });
    const created = await ensureNextWeek(new Date("2026-10-25T12:00:00Z").getTime());
    expect(created?.week).toMatchObject({ weekNumber: 9, label: "Week 9", status: "setup", moneyGameCount: 3, pickDeadline: "2026-10-31T16:00:00.000Z" });
    expect(created?.import.added).toBe(3);
    // Next run: latest week (9) isn't graded, so nothing more is created.
    expect(await ensureNextWeek(new Date("2026-10-25T12:00:00Z").getTime())).toBeNull();
  });

  it("does nothing when ESPN lists no games (e.g. the season is over)", async () => {
    events = {};
    week({ id: 8, weekNumber: 8, pickDeadline: "2026-10-24T16:00:00.000Z", status: "graded" });
    expect(await ensureNextWeek(new Date("2026-10-25T12:00:00Z").getTime())).toBeNull();
    expect(db.weeks).toHaveLength(1);
  });
});
