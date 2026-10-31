import { describe, expect, it } from "vitest";
import { AuthoritativeMatch } from "../src/match.js";
import type { ObjectiveRules } from "../../../packages/battle-core/dist/index.js";
const rules: ObjectiveRules = {
  experimental: true,
  captureTicks: 1,
  radiusUnits: 500,
  scoreEveryTicks: 1,
  targetScore: 1,
  limitTicks: 5,
  points: [
    {
      id: "p",
      name: "P",
      position: { x: 6000, y: 4000 },
      opensAtTick: 0,
      score: 1,
    },
  ],
};
function match() {
  const m = new AuthoritativeMatch("objectives", rules);
  m.join("a");
  m.join("b");
  return m;
}
describe("objective match authority", () => {
  it("requires the host and two nations to start and cannot accept score spoofing", () => {
    const m = new AuthoritativeMatch("objectives", rules);
    m.join("a");
    expect(m.advance()).toBeNull();
    expect(m.start("a").reason).toBe("NEED_OPPONENT");
    m.join("b");
    expect(m.start("b").reason).toBe("NOT_HOST");
    expect(m.start("a").accepted).toBe(true);
    expect(
      m.submit("a", { type: "CAPTURE", score: 100, squadIds: ["blue-1"] })
        .reason,
    ).toBe("INVALID_FORMAT");
    expect(
      m.submit("a", {
        type: "MOVE",
        squadIds: ["red-1"],
        destination: { x: 0, y: 0 },
      }).reason,
    ).toBe("NOT_OWNER");
  });
  it("sends the same public objectives to both nations, ends and freezes commands/ticks", () => {
    const m = match();
    m.start("a");
    expect(m.advance()?.state.tick).toBe(1);
    expect(m.objectiveMatch?.result?.winner).toBe("blue");
    expect(m.ready).toBe(false);
    expect(m.view("blue").objectiveMatch).toEqual(m.view("red").objectiveMatch);
    expect(
      m.submit("a", {
        type: "MOVE",
        squadIds: ["blue-1"],
        destination: { x: 0, y: 0 },
      }).reason,
    ).toBe("MATCH_FINISHED");
    expect(m.advance()).toBeNull();
    expect(m.state.tick).toBe(1);
    expect(m.join("late")).toBeNull();
  });
  it("pauses timers on drop, restores the same seat and aborts on permanent departure", () => {
    const m = match();
    m.start("a");
    m.drop("b");
    expect(m.advance()).toBeNull();
    expect(m.objectiveMatch?.tick).toBe(0);
    expect(m.reconnect("b")).toBe(true);
    expect(m.ready).toBe(true);
    m.leave("b");
    expect(m.objectiveMatch?.result).toMatchObject({
      reason: "abandoned",
      winner: null,
    });
    expect(m.join("replacement")).toBeNull();
  });
  it("does not abort when leaving a lobby and returns cloned projections", () => {
    const m = match();
    m.leave("b");
    expect(m.objectiveMatch?.result).toBeNull();
    expect(m.join("c")).toBe("red");
    const v = m.view("blue");
    v.objectiveMatch!.scores.blue = 999;
    expect(m.objectiveMatch?.scores.blue).toBe(0);
  });
});
