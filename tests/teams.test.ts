import { describe, expect, it, vi } from "vitest";

const T = (id: string, location: string, abbreviation: string, logo = `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`) => ({
  team: { id, location, displayName: `${location} Mascots`, abbreviation, logos: [{ href: logo, rel: ["full", "default"] }, { href: logo.replace("/500/", "/500-dark/"), rel: ["full", "dark"] }] },
});
let calls = 0;
vi.stubGlobal("fetch", async () => {
  calls++;
  return {
    ok: true,
    json: async () => ({
      sports: [{ leagues: [{ teams: [T("2390", "Miami", "MIA"), T("193", "Miami (OH)", "M-OH"), T("194", "Ohio State", "OSU"), T("195", "Ohio", "OHIO"), T("666", "Evil", "EVL", "https://evil.example.com/x.png"), T("667", "Sneaky", "SNK", "javascript:alert(1)")] }] }],
    }),
  };
});
const { getTeamInfo } = await import("../server/teams");

describe("getTeamInfo", () => {
  it("matches look-alike names to the right team", async () => {
    const info = await getTeamInfo(["Miami", "Miami (OH)", "Ohio", "Ohio State"]);
    expect(info.Miami.abbreviation).toBe("MIA");
    expect(info["Miami (OH)"].abbreviation).toBe("M-OH");
    expect(info.Ohio.abbreviation).toBe("OHIO");
    expect(info["Ohio State"].abbreviation).toBe("OSU");
    expect(info.Miami.logoDark).toContain("/500-dark/");
  });

  it("only passes through https logos on ESPN's CDN", async () => {
    const info = await getTeamInfo(["Evil", "Sneaky"]);
    expect(info.Evil.logo).toBeNull();
    expect(info.Sneaky.logo).toBeNull();
  });

  it("skips unknown teams and reuses the cached list", async () => {
    const before = calls;
    const info = await getTeamInfo(["Nowhere State"]);
    expect(info["Nowhere State"]).toBeUndefined();
    expect(calls).toBe(before);
  });
});
