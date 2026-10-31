import { describe, expect, it } from "vitest";
import { createBattle, step, parseBattleConfig } from "../src/index.js";
import type { BattleScenario } from "../src/index.js";
import { loadBattleConfig } from "../src/node.js";

const base = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
function scenario(
  unitType: "archers" | "cavalry",
  enemyX: number,
): BattleScenario {
  return {
    players: [
      { id: "p1", nationId: "blue", level: 16 },
      { id: "p2", nationId: "red", level: 16 },
    ],
    squads: [
      {
        id: "a",
        ownerPlayerId: "p1",
        nationId: "blue",
        unitType,
        hpMilli: 2000000,
        maxSoldiers: 20,
        position: { x: 0, y: 0 },
        stance: "aggressive",
      },
      {
        id: "b",
        ownerPlayerId: "p2",
        nationId: "red",
        unitType: "infantry",
        hpMilli: 2000000,
        maxSoldiers: 20,
        position: { x: enemyX, y: 0 },
        facing: { x: -1, y: 0 },
        stance: "defensive",
      },
    ],
    commanders: [
      {
        id: "c",
        ownerPlayerId: "p1",
        assignedSquadId: "a",
        hpMilli: 450000,
        maxHpMilli: 450000,
      },
    ],
  };
}
describe("pure battle vision policy", () => {
  it("prevents automatic attacks and direct attack commands against unseen enemies", () => {
    const config = parseBattleConfig({
      ...base,
      visibility: { radiusTiles: 1 },
    });
    const state = createBattle(config, 41, scenario("archers", 3000));
    expect(
      step(state, []).events.some(
        (e) => e.type === "ATTACK_HIT" && e.actorId === "a",
      ),
    ).toBe(false);
    const result = step(state, [
      {
        playerId: "p1",
        command: {
          type: "ATTACK",
          squadIds: ["a"],
          targetSquadId: "b",
          seq: 0,
          requestedTick: 0,
        },
      },
    ]);
    expect(
      result.events.some(
        (e) =>
          e.type === "COMMAND_REJECTED" && e.reason === "TARGET_NOT_VISIBLE",
      ),
    ).toBe(true);
    expect(
      step(createBattle(base, 41, scenario("archers", 3000)), []).events.some(
        (e) => e.type === "ATTACK_HIT" && e.actorId === "a",
      ),
    ).toBe(true);
  });
  it("stops tracking an explicit attack when the enemy leaves shared vision", () => {
    const config = parseBattleConfig({
      ...base,
      visibility: { radiusTiles: 10 },
    });
    let state = createBattle(config, 41, scenario("cavalry", 9000));
    state = step(state, [
      {
        playerId: "p1",
        command: {
          type: "ATTACK",
          squadIds: ["a"],
          targetSquadId: "b",
          seq: 0,
          requestedTick: 0,
        },
      },
    ]).state;
    expect(state.squads.find((s) => s.id === "a")?.order?.type).toBe("ATTACK");
    state.squads.find((s) => s.id === "b")!.position.x = 20000;
    const next = step(state, []).state.squads.find((s) => s.id === "a")!;
    expect(next.order).toBeNull();
    expect(next.currentTargetId).toBeNull();
  });
  it("rejects unseen Q targets and unsafe radius configuration", () => {
    const config = parseBattleConfig({
      ...base,
      visibility: { radiusTiles: 1 },
    });
    const state = createBattle(config, 41, scenario("cavalry", 5000));
    const result = step(state, [
      {
        playerId: "p1",
        command: {
          type: "CAST_SKILL",
          skill: "Q",
          commanderId: "c",
          squadIds: ["a"],
          targetSquadId: "b",
          seq: 0,
          requestedTick: 0,
        },
      },
    ]);
    expect(result.events.some((e) => e.reason === "TARGET_NOT_VISIBLE")).toBe(
      true,
    );
    expect(() =>
      parseBattleConfig({
        ...base,
        visibility: { radiusTiles: Number.MAX_SAFE_INTEGER },
      }),
    ).toThrow();
  });
});
