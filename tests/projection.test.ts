import { describe, expect, it } from "vitest";
import { tallyWeek } from "@/lib/projection";
import type { Game } from "@shared/schema";

const G = (id: number, fields: Partial<Game>): Game =>
  ({ id, weekId: 1, awayTeam: `A${id}`, homeTeam: `H${id}`, favoriteTeam: `H${id}`, spread: 3, pickType: "SU", isSelected: true, status: "scheduled", awayScore: null, homeScore: null, isMoneyGame: false, kickoff: "", ...fields }) as Game;

describe("tallyWeek", () => {
  const games = [G(1, { isMoneyGame: true }), G(2, {}), G(3, {}), G(4, {})];
  const live = {
    1: { state: "in" as const, awayScore: 7, homeScore: 14, detail: "Q2" }, // H1 winning, money game
    2: { state: "in" as const, awayScore: 21, homeScore: 7, detail: "Q3" }, // A2 winning
    3: { state: "in" as const, awayScore: 10, homeScore: 10, detail: "Q1" }, // tied
  };
  const picks = {
    1: { selectedTeam: "H1", isCorrect: null },
    2: { selectedTeam: "H2", isCorrect: null },
    3: { selectedTeam: "A3", isCorrect: null },
    4: { selectedTeam: "A4", isCorrect: true }, // already graded
  };

  it("projects points under the league's rules", () => {
    const t = tallyWeek(games, picks, 1, null, live);
    expect(t).toMatchObject({ wins: 1, losses: 0, liveWinning: 1, liveLosing: 1, liveEven: 1, officialPoints: 1 });
    expect(t.projectedPoints).toBe(3); // 1 official + 2 for the winning money game
  });

  it("adds upset points only while the underdog leads outright", () => {
    const upsetGame = G(9, { awayTeam: "Navy", homeTeam: "Army", favoriteTeam: "Army", spread: 9, isSelected: false });
    const upset = { result: "pending" as const, spread: 9, underdogTeam: "Navy", game: upsetGame };
    const leading = tallyWeek([], {}, 0, upset, { 9: { state: "in", awayScore: 14, homeScore: 10, detail: "" } });
    expect(leading).toMatchObject({ upsetLive: "winning", projectedPoints: 2 });
    const trailing = tallyWeek([], {}, 0, upset, { 9: { state: "in", awayScore: 7, homeScore: 10, detail: "" } });
    expect(trailing).toMatchObject({ upsetLive: "losing", projectedPoints: 0 });
  });
});
