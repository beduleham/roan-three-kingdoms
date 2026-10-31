import { describe, expect, it } from "vitest";
import {
  createBattle,
  createObjectiveMatch,
  advanceObjectives,
  finishObjectiveMatch,
  objectiveRulesSchema,
  hashReplayValue,
} from "../src/index.js";
import { loadBattleConfig } from "../src/node.js";
import type { ObjectiveRules, ObjectiveMatchState } from "../src/index.js";
const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
const rules: ObjectiveRules = {
  experimental: true,
  captureTicks: 2,
  radiusUnits: 1000,
  scoreEveryTicks: 5,
  targetScore: 3,
  limitTicks: 21,
  points: [
    {
      id: "p",
      name: "거점",
      position: { x: 5000, y: 5000 },
      opensAtTick: 0,
      score: 1,
    },
  ],
};
function battle(blueX = 5000, redX = 15000) {
  return createBattle(config, 1, {
    players: [
      { id: "b", nationId: "blue" },
      { id: "r", nationId: "red" },
    ],
    squads: [
      {
        id: "b",
        ownerPlayerId: "b",
        nationId: "blue",
        unitType: "infantry",
        maxSoldiers: 20,
        hpMilli: 2000000,
        position: { x: blueX, y: 5000 },
      },
      {
        id: "r",
        ownerPlayerId: "r",
        nationId: "red",
        unitType: "infantry",
        maxSoldiers: 20,
        hpMilli: 2000000,
        position: { x: redX, y: 5000 },
      },
    ],
  });
}
const initial = (r = rules) => createObjectiveMatch(r, ["blue", "red"]);
function advance(s: ObjectiveMatchState, b = battle(), r = rules) {
  b.tick = s.tick + 1;
  return advanceObjectives(s, b, r);
}
describe("experimental objective rules", () => {
  it("requires continuous sole presence and does not mutate inputs", () => {
    const state = initial(),
      before = hashReplayValue(state),
      b = battle();
    const one = advance(state, b);
    expect(one.points[0]!.progressTicks).toBe(1);
    expect(one.points[0]!.owner).toBeNull();
    expect(advance(one, b).points[0]!.owner).toBe("blue");
    expect(hashReplayValue(state)).toBe(before);
  });
  it("contests by nation, resets interrupted progress and stops income", () => {
    let s = advance(initial());
    s = advance(s, battle(5000, 5000));
    expect(s.points[0]).toMatchObject({
      contested: true,
      progressTicks: 0,
      owner: null,
    });
    s = advance(s);
    expect(s.points[0]!.owner).toBeNull();
    s = advance(s);
    expect(s.points[0]!.owner).toBe("blue");
    s = advance(s, battle(5000, 5000));
    expect(s.scores.blue).toBe(0);
    expect(s.points[0]!.owner).toBe("blue");
  });
  it("lets enemies take over but suspends the old owner's income during capture", () => {
    let s = advance(advance(initial()));
    s = advance(s);
    s = advance(s);
    s = advance(s, battle(15000, 5000));
    expect(s.scores.blue).toBe(0);
    expect(s.points[0]!.capturing).toBe("red");
    expect(advance(s, battle(15000, 5000)).points[0]!.owner).toBe("red");
  });
  it.each(["dead", "routed", "broken", "retreat", "zero-cohesion"])(
    "excludes %s squads from capture",
    (kind) => {
      const b = battle(),
        s = b.squads[0]!;
      if (kind === "dead") s.hpMilli = 0;
      if (kind === "routed") s.fsmState = "ROUTED";
      if (kind === "broken") s.fsmState = "BROKEN";
      if (kind === "retreat")
        s.order = { type: "RETREAT", destination: { x: 0, y: 0 }, seq: 0 };
      if (kind === "zero-cohesion") s.cohesion = 0;
      expect(advance(initial(), b).points[0]!.progressTicks).toBe(0);
    },
  );
  it("counts same-nation reinforcements once and includes the radius boundary", () => {
    const b = battle(6000);
    b.squads.push({ ...structuredClone(b.squads[0]!), id: "ally" });
    expect(advance(initial(), b).points[0]!.progressTicks).toBe(1);
    expect(advance(initial(), battle(6001)).points[0]!.progressTicks).toBe(0);
  });
  it("honors opening tick and awards periodic income only once", () => {
    const r = { ...rules, points: [{ ...rules.points[0]!, opensAtTick: 4 }] };
    let s = initial(r);
    for (let i = 0; i < 3; i++) s = advance(s, battle(), r);
    expect(s.points[0]!.open).toBe(false);
    s = advance(s, battle(), r);
    expect(s.points[0]!.progressTicks).toBe(1);
    s = advance(s, battle(), r);
    expect(s.scores.blue).toBe(1);
    expect(advance(s, battle(), r).scores.blue).toBe(1);
  });
  it("finishes at target, freezes the result, and is deterministic", () => {
    function run() {
      let s = initial();
      while (!s.result) s = advance(s);
      return s;
    }
    const end = run();
    expect(end.result).toMatchObject({
      winner: "blue",
      reason: "score",
      tick: 15,
      scores: { blue: 3, red: 0 },
    });
    expect(advance(end)).toBe(end);
    expect(hashReplayValue(end)).toBe(hashReplayValue(run()));
  });
  it("applies simultaneous income before declaring a draw", () => {
    const r = {
      ...rules,
      targetScore: 1,
      points: [
        rules.points[0]!,
        { ...rules.points[0]!, id: "r", position: { x: 15000, y: 5000 } },
      ],
    };
    let s = initial(r);
    for (let i = 0; i < 5; i++) s = advance(s, battle(), r);
    expect(s.result).toMatchObject({
      winner: null,
      reason: "score",
      scores: { blue: 1, red: 1 },
    });
  });
  it("handles score lead or tie at an odd deadline, without extending the game", () => {
    for (const x of [5000, 20000]) {
      let s = initial({ ...rules, targetScore: 100 });
      while (!s.result)
        s = advance(s, battle(x), { ...rules, targetScore: 100 });
      expect(s.result).toMatchObject({
        tick: 21,
        reason: "time",
        winner: x === 5000 ? "blue" : null,
      });
    }
  });
  it("aborts without assigning a victory and does not overwrite a final result", () => {
    const end = finishObjectiveMatch(initial(), "abandoned");
    expect(end.result?.winner).toBeNull();
    expect(finishObjectiveMatch(end, "time")).toBe(end);
  });
  it("rejects duplicate IDs, invalid settings and skipped ticks", () => {
    expect(
      objectiveRulesSchema.safeParse({ ...rules, captureTicks: 0 }).success,
    ).toBe(false);
    expect(
      objectiveRulesSchema.safeParse({
        ...rules,
        points: [rules.points[0], rules.points[0]],
      }).success,
    ).toBe(false);
    const b = battle();
    b.tick = 2;
    expect(() => advanceObjectives(initial(), b, rules)).toThrow("consecutive");
  });
});
