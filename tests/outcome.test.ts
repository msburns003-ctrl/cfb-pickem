import { describe, expect, it } from "vitest";
import { coveringTeam, livePickStatus, outcomeFromScores, upsetPickPoints } from "@shared/outcome";

// Georgia (away) favored by 7.5 at Florida.
const ats = { awayTeam: "Georgia", homeTeam: "Florida", favoriteTeam: "Georgia", spread: 7.5, pickType: "ATS" as const };
// Ohio State (away) favored by 3 at Penn State.
const su = { awayTeam: "Ohio State", homeTeam: "Penn State", favoriteTeam: "Ohio State", spread: 3, pickType: "SU" as const };

describe("outcomeFromScores", () => {
  it("favorite covers when winning by more than the spread", () => {
    expect(outcomeFromScores(ats, 31, 20)).toEqual({ winner: "Georgia", atsResult: "favorite" });
  });
  it("underdog covers when the favorite wins by less than the spread", () => {
    expect(outcomeFromScores(ats, 24, 20)).toEqual({ winner: "Georgia", atsResult: "underdog" });
  });
  it("underdog covers when it wins outright", () => {
    expect(outcomeFromScores(ats, 17, 20)).toEqual({ winner: "Florida", atsResult: "underdog" });
  });
  it("is a push when the margin equals the spread", () => {
    expect(outcomeFromScores({ ...ats, spread: 7 }, 27, 20).atsResult).toBe("push");
  });
  it("works when the home team is the favorite", () => {
    const homeFav = { ...ats, favoriteTeam: "Florida" };
    expect(outcomeFromScores(homeFav, 10, 21)).toEqual({ winner: "Florida", atsResult: "favorite" });
  });
  it("has no winner on a tie", () => {
    expect(outcomeFromScores(su, 14, 14).winner).toBeNull();
  });
});

describe("coveringTeam", () => {
  it("returns the favorite, the underdog, or null on a push", () => {
    expect(coveringTeam(ats, "favorite")).toBe("Georgia");
    expect(coveringTeam(ats, "underdog")).toBe("Florida");
    expect(coveringTeam(ats, "push")).toBeNull();
  });
});

describe("livePickStatus", () => {
  it("uses the spread for ATS games", () => {
    expect(livePickStatus(ats, "Florida", 24, 20)).toBe("winning"); // dog covering while losing
    expect(livePickStatus(ats, "Georgia", 24, 20)).toBe("losing");
  });
  it("uses the score for straight-up games", () => {
    expect(livePickStatus(su, "Penn State", 14, 17)).toBe("winning");
    expect(livePickStatus(su, "Ohio State", 14, 17)).toBe("losing");
    expect(livePickStatus(su, "Ohio State", 10, 10)).toBe("even");
  });
});

describe("upsetPickPoints (league rule: >=15 -> 3, >=7.5 -> 2, >=0.5 -> 1)", () => {
  it.each([
    [0, 0],
    [0.5, 1],
    [7, 1],
    [7.5, 2],
    [14.5, 2],
    [15, 3],
    [28, 3],
    [-9, 2], // sign doesn't matter
  ])("spread %s is worth %s", (spread, points) => {
    expect(upsetPickPoints(spread)).toBe(points);
  });
});
