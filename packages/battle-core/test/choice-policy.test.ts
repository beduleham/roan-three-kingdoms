import { it, expect } from "vitest";
import { createBattle, step } from "../src/index.js";
import { loadBattleConfig } from "../src/node.js";
const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
function setup(seed: number, reverse = false) {
  const squads = [
    {
      id: "src",
      ownerPlayerId: "p",
      nationId: "blue",
      unitType: "archers" as const,
      maxSoldiers: 20,
      hpMilli: 2000000,
      position: { x: 0, y: 0 },
      stance: "defensive" as const,
    },
    ...["left", "right"].map((id, i) => ({
      id,
      ownerPlayerId: "e",
      nationId: "red",
      unitType: "infantry" as const,
      maxSoldiers: 20,
      hpMilli: 2000000,
      position: { x: i ? 2000 : -2000, y: 0 },
      stance: "defensive" as const,
    })),
  ];
  return createBattle(config, seed, {
    choicePolicy: { augmentOffers: "seeded", targetTies: "seeded" },
    players: [
      { id: "p", nationId: "blue" },
      { id: "e", nationId: "red" },
    ],
    squads: reverse ? squads.reverse() : squads,
  });
}
it("seeded automatic target ties are replayable and independent of input array order", () => {
  const targets = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const a = step(setup(seed), []),
      b = step(setup(seed, true), []);
    expect(a).toEqual(b);
    targets.add(a.state.squads.find((s) => s.id === "src")!.currentTargetId);
    expect(a.events.some((e) => e.type === "SKILL_CAST")).toBe(false);
  }
  expect(targets.size).toBe(2);
});
it("explicit human target commands take precedence over seeded automatic target selection", () => {
  const result = step(setup(1), [
    {
      playerId: "p",
      command: {
        type: "ATTACK",
        squadIds: ["src"],
        targetSquadId: "right",
        seq: 0,
        requestedTick: 0,
      },
    },
  ]);
  expect(result.state.squads.find((s) => s.id === "src")!.currentTargetId).toBe(
    "right",
  );
});
