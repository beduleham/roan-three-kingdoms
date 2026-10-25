import { describe, expect, it } from "vitest";
import {
  createBattle,
  step,
  replay,
  calculateDamage,
  canonicalJson,
} from "../src/index.js";
import type {
  BattleScenario,
  BattleState,
  BattleInput,
  Squad,
} from "../src/index.js";
import { loadBattleConfig } from "../src/node.js";
import { skillMultiplier } from "../src/effects.js";
import { contactFor, distanceSquared } from "../src/spatial.js";

const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
function scenario(enemyX = 20000): BattleScenario {
  return {
    players: [
      { id: "p1", nationId: "n1", level: 15, rank: "general" },
      { id: "p2", nationId: "n1", level: 15, rank: "general" },
      { id: "enemy", nationId: "n2" },
    ],
    squads: [
      {
        id: "a",
        ownerPlayerId: "p1",
        nationId: "n1",
        unitType: "cavalry",
        maxSoldiers: 20,
        hpMilli: 2000000,
        stance: "defensive",
        position: { x: 0, y: 0 },
      },
      {
        id: "a2",
        ownerPlayerId: "p1",
        nationId: "n1",
        unitType: "spears",
        maxSoldiers: 20,
        hpMilli: 2000000,
        stance: "defensive",
        position: { x: 1000, y: 3000 },
      },
      {
        id: "a3",
        ownerPlayerId: "p1",
        nationId: "n1",
        unitType: "infantry",
        maxSoldiers: 20,
        hpMilli: 2000000,
        stance: "defensive",
        position: { x: 1000, y: -3000 },
      },
      {
        id: "ally",
        ownerPlayerId: "p2",
        nationId: "n1",
        unitType: "archers",
        maxSoldiers: 20,
        hpMilli: 2000000,
        stance: "defensive",
        position: { x: 0, y: 5000 },
      },
      {
        id: "b",
        ownerPlayerId: "enemy",
        nationId: "n2",
        unitType: "infantry",
        maxSoldiers: 20,
        hpMilli: 2000000,
        stance: "defensive",
        position: { x: enemyX, y: 0 },
        facing: { x: -1, y: 0 },
      },
    ],
    commanders: [
      {
        id: "c1",
        ownerPlayerId: "p1",
        assignedSquadId: "a",
        hpMilli: 450000,
        maxHpMilli: 450000,
        respawnZoneIndex: 0,
      },
      {
        id: "c2",
        ownerPlayerId: "p2",
        assignedSquadId: "ally",
        hpMilli: 450000,
        maxHpMilli: 450000,
        respawnZoneIndex: 0,
      },
    ],
    safeZones: [
      { nationId: "n1", position: { x: -5000, y: 0 }, radiusUnits: 100 },
    ],
  };
}
function cast(
  skill: "Q" | "W" | "R",
  squadIds = ["a"],
  tick = 0,
  seq = tick,
  commanderId = "c1",
  playerId = "p1",
  targetSquadId?: string,
): BattleInput {
  return {
    playerId,
    command: {
      type: "CAST_SKILL",
      commanderId,
      skill,
      squadIds,
      requestedTick: tick,
      seq,
      ...(targetSquadId ? { targetSquadId } : {}),
    },
  };
}
function move(
  id: string,
  x: number,
  y: number,
  tick: number,
  seq = tick,
  playerId = "p1",
): BattleInput {
  return {
    playerId,
    command: {
      type: "MOVE",
      squadIds: [id],
      destination: { x, y },
      requestedTick: tick,
      seq,
    },
  };
}
function reassign(id: string, tick = 0, seq = tick): BattleInput {
  return {
    playerId: "p1",
    command: {
      type: "REASSIGN_COMMANDER",
      commanderId: "c1",
      squadIds: [id],
      requestedTick: tick,
      seq,
    },
  };
}
const frames = (n: number) => Array.from({ length: n }, () => []);
const unit = (state: BattleState, id = "a") =>
  state.squads.find((s) => s.id === id)!;
const chief = (state: BattleState, id = "c1") =>
  state.commanders.find((c) => c.id === id)!;
function reason(state: BattleState, input: BattleInput) {
  return step(state, [input]).events.find((e) => e.type === "COMMAND_REJECTED")
    ?.reason;
}

describe("Phase 3 commander lifecycle", () => {
  it("follows its host exactly and does not limit basic orders by command radius", () => {
    let state = createBattle(config, 1, scenario());
    state = step(state, [move("a", 100000, 0, 0)]).state;
    expect(chief(state).position).toEqual(unit(state).position);
    expect(unit(state).position.x).toBe(320);
    const result = step(state, [move("a3", -100000, -3000, 1)]);
    expect(
      result.events.some(
        (e) => e.type === "ORDER_ACCEPTED" && e.actorId === "a3",
      ),
    ).toBe(true);
    state = replay(result.state, frames(50)).state;
    expect(chief(state).position).toEqual(unit(state).position);
    expect(
      distanceSquared(chief(state).position, unit(state, "a3").position),
    ).toBeGreaterThan(10000n ** 2n);
  });
  it("reassigns by physical movement, then follows a moving new host", () => {
    let state = step(createBattle(config, 1, scenario()), [
      reassign("a2"),
    ]).state;
    expect(chief(state).status).toBe("REASSIGNING");
    expect(chief(state).assignedSquadId).toBeNull();
    expect(chief(state).position).not.toEqual(unit(state, "a2").position);
    expect(
      distanceSquared({ x: 0, y: 0 }, chief(state).position),
    ).toBeLessThanOrEqual(200n ** 2n);
    state = replay(state, frames(20)).state;
    expect(chief(state).assignedSquadId).toBe("a2");
    state = step(state, [move("a2", 5000, 3000, state.tick)]).state;
    expect(chief(state).position).toEqual(unit(state, "a2").position);
  });
  it("retargets reassignment from the current position without teleportation", () => {
    let state = replay(
      step(createBattle(config, 1, scenario()), [reassign("a2")]).state,
      frames(3),
    ).state;
    const before = { ...chief(state).position };
    state = step(state, [reassign("a3", state.tick)]).state;
    expect(distanceSquared(before, chief(state).position)).toBeLessThanOrEqual(
      200n ** 2n,
    );
    expect(chief(state).reassignTargetId).toBe("a3");
    expect(reason(state, cast("W", ["a"], state.tick))).toBe(
      "COMMANDER_DISABLED",
    );
    state = replay(state, frames(40)).state;
    expect(chief(state).assignedSquadId).toBe("a3");
  });
  it("cancels a reassignment whose target dies and remains at its last actual position", () => {
    let state = step(createBattle(config, 1, scenario()), [
      reassign("a2"),
    ]).state;
    const before = { ...chief(state).position };
    unit(state, "a2").hpMilli = 0;
    unit(state, "a2").fsmState = "DEFEATED";
    state = step(state, []).state;
    expect(chief(state).status).toBe("EXPOSED");
    expect(chief(state).position).toEqual(before);
    expect(chief(state).reassignTargetId).toBeNull();
  });
  it("splits incoming damage, wounds the commander and removes source effects while allowing basic orders", () => {
    const setup = scenario(1000);
    setup.commanders![0]!.hpMilli = 1;
    let result = step(createBattle(config, 1, setup), [cast("W", ["a"])]);
    expect(result.events.some((e) => e.type === "COMMANDER_WOUNDED")).toBe(
      true,
    );
    expect(chief(result.state).hpMilli).toBe(0);
    expect(
      result.state.skillEffects.filter((e) => e.sourceCommanderId === "c1"),
    ).toHaveLength(0);
    expect(reason(result.state, cast("R", ["a"], 1))).toBe("COMMANDER_WOUNDED");
    result = step(result.state, [move("a", -10000, 0, 1)]);
    expect(
      result.events.some(
        (e) => e.type === "ORDER_ACCEPTED" && e.actorId === "a",
      ),
    ).toBe(true);
    expect(unit(result.state).position.x).toBeLessThan(0);
  });
  it("uses configured guard strength without losing or duplicating damage", () => {
    const run = (soldiers: number, cohesion: number) => {
      const setup = scenario(1000);
      setup.squads![0]!.hpMilli = soldiers * 100000;
      setup.squads![0]!.cohesion = cohesion;
      return step(createBattle(config, 1, setup), []);
    };
    const protectedResult = run(20, 100),
      exposedResult = run(3, 0);
    const pDamage = protectedResult.events.find(
      (e) => e.type === "COMMANDER_HIT" && e.actorId === "c1",
    )!.delta!;
    const eDamage = exposedResult.events.find(
      (e) => e.type === "COMMANDER_HIT" && e.actorId === "c1",
    )!.delta!;
    expect(-eDamage).toBeGreaterThan(-pDamage);
    const incoming = -protectedResult.events.find(
      (e) => e.type === "ATTACK_HIT" && e.targetId === "a",
    )!.delta!;
    expect(2000000 - unit(protectedResult.state).hpMilli - pDamage).toBe(
      incoming,
    );
  });
  it("respawns after exactly the configured delay at its designated friendly zone, detached", () => {
    const setup = scenario(1000);
    setup.commanders![0]!.hpMilli = 1;
    const injury = step(createBattle(config, 1, setup), []);
    expect(chief(injury.state).respawnRemainingTicks).toBe(130);
    let state = replay(injury.state, frames(129)).state;
    expect(chief(state).status).toBe("WOUNDED");
    expect(chief(state).respawnRemainingTicks).toBe(1);
    const result = step(state, []);
    expect(
      result.events.some(
        (e) => e.type === "COMMANDER_RESPAWNED" && e.actorId === "c1",
      ),
    ).toBe(true);
    expect(chief(result.state).position).toEqual({ x: -5000, y: 0 });
    expect(chief(result.state).hpMilli).toBe(450000);
    expect(chief(result.state).assignedSquadId).toBeNull();
    expect(chief(result.state).status).toBe("EXPOSED");
  });
  it("does not invent a spawn point or accept an enemy respawn zone", () => {
    const setup = scenario();
    setup.commanders![0]!.hpMilli = 0;
    setup.commanders![0]!.respawnZoneIndex = null;
    const result = replay(createBattle(config, 1, setup), frames(131));
    expect(chief(result.state).status).toBe("WOUNDED");
    setup.commanders![0]!.respawnZoneIndex = 0;
    setup.safeZones![0]!.nationId = "n2";
    expect(() => createBattle(config, 1, setup)).toThrow(
      "Invalid friendly respawn zone",
    );
  });
});

describe("Warrior authority, range and effect lifecycle", () => {
  it("rejects foreign commanders and non-warrior casters", () => {
    const state = createBattle(config, 1, scenario());
    expect(reason(state, cast("W", ["a"], 0, 0, "c2"))).toBe("NOT_OWNER");
    chief(state).classId = "strategist";
    expect(reason(state, cast("W"))).toBe("WRONG_CLASS");
  });
  it("W accepts allied players and archers, at most two, never enemies", () => {
    const state = createBattle(config, 1, scenario());
    const result = step(state, [cast("W", ["a", "ally"])]);
    expect(
      result.events.filter((e) => e.type === "SKILL_EFFECT_APPLIED"),
    ).toHaveLength(2);
    expect(reason(state, cast("W", ["a", "a2", "ally"]))).toBe("TARGET_LIMIT");
    expect(reason(state, cast("W", ["b"]))).toBe("NOT_OWNER");
  });
  it("R requires level 15, own melee targets and a maximum of three", () => {
    const setup = scenario();
    setup.players![0]!.level = 14;
    expect(reason(createBattle(config, 1, setup), cast("R", ["a"]))).toBe(
      "LEVEL_REQUIRED",
    );
    const state = createBattle(config, 1, scenario());
    expect(
      step(state, [cast("R", ["a", "a2", "a3"])]).events.filter(
        (e) => e.type === "SKILL_EFFECT_APPLIED",
      ),
    ).toHaveLength(3);
    expect(reason(state, cast("R", ["ally"]))).toBe("NOT_OWNER");
    unit(state, "a3").unitType = "archers";
    expect(reason(state, cast("R", ["a3"]))).toBe("MELEE_REQUIRED");
    expect(reason(state, cast("R", ["a", "a2", "a3", "ally"]))).toBe(
      "TARGET_LIMIT",
    );
  });
  it.each(["W", "R"] as const)(
    "%s checks the exact command-radius boundary",
    (skill) => {
      const state = createBattle(config, 1, scenario());
      unit(state, "a2").position = { x: 10000, y: 0 };
      unit(state, "a2").anchor = { x: 10000, y: 0 };
      expect(reason(state, cast(skill, ["a2"]))).toBeUndefined();
      unit(state, "a2").position.x = 10001;
      expect(reason(state, cast(skill, ["a2"]))).toBe("OUT_OF_COMMAND_RANGE");
    },
  );
  it.each(["ROUTED", "BROKEN"] as const)(
    "rejects skills from a %s host or on a forced target",
    (status) => {
      const state = createBattle(config, 1, scenario());
      unit(state).fsmState = status;
      if (status === "ROUTED") unit(state).morale = 0;
      else unit(state).cohesion = 0;
      expect(reason(state, cast("W", ["a2"]))).toBe("COMMANDER_DISABLED");
      const normal = createBattle(config, 1, scenario());
      unit(normal, "a2").fsmState = status;
      if (status === "ROUTED") unit(normal, "a2").morale = 0;
      else unit(normal, "a2").cohesion = 0;
      expect(reason(normal, cast("W", ["a2"]))).toBe("FORCED_STATE");
    },
  );
  it("rejects duplicate or stale skill input without duplicate cast or effect events", () => {
    const state = createBattle(config, 1, scenario());
    const input = cast("W");
    const dup = step(state, [input, input]);
    expect(dup.events.filter((e) => e.reason === "DUPLICATE_SEQ")).toHaveLength(
      2,
    );
    expect(dup.state.skillEffects).toHaveLength(0);
    const accepted = step(state, [input]).state;
    expect(reason(accepted, cast("R", ["a"], 1, 0))).toBe("STALE_SEQ");
  });
  it.each(["W", "R"] as const)(
    "%s expires at its configured boundary and cooldown permits the exact next tick",
    (skill) => {
      const settings = config.warriorSkills[skill];
      const castResult = step(createBattle(config, 1, scenario()), [
        cast(skill),
      ]);
      let state = replay(
        castResult.state,
        frames(settings.durationTicks - 1),
      ).state;
      // The next interval starts at expiresAt; the event is emitted when stepping that boundary.
      const last = step(state, []);
      expect(
        last.events.filter(
          (e) => e.type === "SKILL_EFFECT_EXPIRED" && e.skill === skill,
        ),
      ).toHaveLength(1);
      expect(last.state.skillEffects).toHaveLength(0);
      state = replay(
        castResult.state,
        frames(settings.cooldownTicks - 2),
      ).state;
      expect(state.tick).toBe(settings.cooldownTicks - 1);
      const denied = step(state, [cast(skill, ["a"], state.tick)]);
      expect(
        denied.events.find((e) => e.type === "COMMAND_REJECTED")!.reason,
      ).toBe("COOLDOWN");
      const allowed = step(denied.state, [
        cast(skill, ["a"], denied.state.tick),
      ]);
      expect(
        allowed.events.some(
          (e) => e.type === "SKILL_CAST" && e.skill === skill,
        ),
      ).toBe(true);
    },
  );
  it("W heals once and uses maximum rather than multiplicative cross-source buffs", () => {
    const setup = scenario();
    setup.squads![1]!.morale = 70;
    const state = createBattle(config, 1, setup);
    const result = step(state, [
      cast("W", ["a2"], 0, 0),
      cast("W", ["a2"], 0, 0, "c2", "p2"),
    ]);
    expect(unit(result.state, "a2").morale).toBe(82);
    expect(result.state.skillEffects).toHaveLength(2);
    expect(
      skillMultiplier(result.state, unit(result.state, "a2"), "attack"),
    ).toBe(11000);
  });
  it("refreshes same-source effects without stacking or repeated instant morale", () => {
    let state = step(createBattle(config, 1, scenario()), [
      cast("W", ["a2"]),
    ]).state;
    unit(state, "a2").morale = 70;
    chief(state).cooldownTicks.W = 0; // isolate the refresh policy from the normal longer cooldown
    state = step(state, [cast("W", ["a2"], 1)]).state;
    expect(state.skillEffects).toHaveLength(1);
    expect(state.skillEffects[0]!.expiresAt).toBe(61);
    expect(unit(state, "a2").morale).toBe(70);
  });
  it("W modifies actual attack damage and R modifies movement only while active", () => {
    const initial = createBattle(config, 1, scenario(1000));
    const a = unit(initial),
      b = unit(initial, "b");
    const expected = calculateDamage(a, b, contactFor(a, b), config, 11000);
    const w = step(initial, [cast("W")]);
    expect(
      w.events.find((e) => e.type === "ATTACK_HIT" && e.actorId === "a")!.delta,
    ).toBe(-expected);
    const far = scenario(200000);
    let state = step(createBattle(config, 1, far), [
      cast("R"),
      move("a", 100000, 0, 0, 1),
    ]).state;
    expect(unit(state).position.x).toBe(368);
    state = replay(state, frames(79)).state;
    expect(unit(state).position.x).toBe(80 * 368);
    const before = unit(state).position.x;
    state = step(state, []).state;
    expect(unit(state).position.x - before).toBe(320);
  });
  it("reassignment immediately removes previous source effects", () => {
    const state = step(createBattle(config, 1, scenario()), [cast("R")]).state;
    const result = step(state, [reassign("a2", 1)]);
    expect(result.state.skillEffects).toHaveLength(0);
    expect(
      result.events.some(
        (e) =>
          e.type === "SKILL_EFFECT_EXPIRED" && e.reason === "SOURCE_DISABLED",
      ),
    ).toBe(true);
  });
});

describe("Q actual path and collisions", () => {
  it("does not hit on button press, then emits exactly one actual charge impact", () => {
    const result = step(createBattle(config, 1, scenario(5000)), [
      cast("Q", ["a"], 0, 0, "c1", "p1", "b"),
    ]);
    expect(result.events.some((e) => e.type === "SKILL_CAST")).toBe(true);
    expect(result.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(false);
    expect(unit(result.state).position.x).toBe(320);
    const replayed = replay(result.state, frames(30));
    const impacts = replayed.events.filter((e) => e.type === "CHARGE_IMPACT");
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({
      actorId: "a",
      targetId: "b",
      delta: -15,
      moraleDelta: -8,
      sourceCommandSeq: 0,
      sourceCommanderId: "c1",
    });
    expect(unit(replayed.state).charge).toBeNull();
  });
  it("validates Q ownership, count, melee, preparation, facing, range and cooldown", () => {
    const state = createBattle(config, 1, scenario(5000));
    expect(reason(state, cast("Q", ["ally"], 0, 0, "c1", "p1", "b"))).toBe(
      "NOT_OWNER",
    );
    expect(reason(state, cast("Q", ["a", "a2"], 0, 0, "c1", "p1", "b"))).toBe(
      "TARGET_LIMIT",
    );
    unit(state).unitType = "archers";
    expect(reason(state, cast("Q", ["a"], 0, 0, "c1", "p1", "b"))).toBe(
      "MELEE_REQUIRED",
    );
    unit(state).unitType = "cavalry";
    unit(state, "b").position.x = 2249;
    expect(reason(state, cast("Q", ["a"], 0, 0, "c1", "p1", "b"))).toBe(
      "INSUFFICIENT_PREPARATION",
    );
    unit(state, "b").position.x = 2250;
    expect(
      reason(state, cast("Q", ["a"], 0, 0, "c1", "p1", "b")),
    ).toBeUndefined();
    unit(state).facing = { x: -1, y: 0 };
    expect(reason(state, cast("Q", ["a"], 0, 0, "c1", "p1", "b"))).toBe(
      "INVALID_CHARGE_DIRECTION",
    );
    unit(state).facing = { x: 1, y: 0 };
    unit(state, "b").position.x = 10001;
    expect(reason(state, cast("Q", ["a"], 0, 0, "c1", "p1", "b"))).toBe(
      "CHARGE_TOO_FAR",
    );
    unit(state, "b").position.x = 5000;
    const next = step(state, [cast("Q", ["a"], 0, 0, "c1", "p1", "b")]).state;
    expect(reason(next, cast("Q", ["a"], 1, 1, "c1", "p1", "b"))).toBe(
      "COOLDOWN",
    );
  });
  it("a moving target can dodge the fixed path; no homing or fake hit", () => {
    let state = step(createBattle(config, 1, scenario(5000)), [
      cast("Q", ["a"], 0, 0, "c1", "p1", "b"),
    ]).state;
    const escape = step(state, [move("b", 5000, 10000, 1, 1, "enemy")]);
    const result = replay(escape.state, frames(30));
    expect(result.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(false);
    expect(
      result.events.some(
        (e) => e.type === "CHARGE_CANCELLED" && e.reason === "MISSED",
      ),
    ).toBe(true);
  });
  it("a direct movement command cancels charge and cannot award impact", () => {
    const state = step(createBattle(config, 1, scenario(5000)), [
      cast("Q", ["a"], 0, 0, "c1", "p1", "b"),
    ]).state;
    const cancelled = step(state, [move("a", -5000, 0, 1)]);
    expect(
      cancelled.events.some(
        (e) => e.type === "CHARGE_CANCELLED" && e.reason === "DIRECT_ORDER",
      ),
    ).toBe(true);
    expect(
      replay(cancelled.state, frames(30)).events.some(
        (e) => e.type === "CHARGE_IMPACT",
      ),
    ).toBe(false);
  });
  it("an intervening enemy blocks the charge path", () => {
    const setup = scenario(5000);
    setup.squads!.push({
      id: "blocker",
      ownerPlayerId: "enemy",
      nationId: "n2",
      unitType: "infantry",
      maxSoldiers: 20,
      hpMilli: 2000000,
      stance: "defensive",
      position: { x: 3500, y: 0 },
    });
    const result = replay(
      step(createBattle(config, 1, setup), [
        cast("Q", ["a"], 0, 0, "c1", "p1", "b"),
      ]).state,
      frames(30),
    );
    expect(result.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(false);
    expect(
      result.events.some(
        (e) => e.type === "CHARGE_CANCELLED" && e.reason === "BLOCKED_BY_ENEMY",
      ),
    ).toBe(true);
  });
  it("a premature collision does not satisfy the run-up requirement", () => {
    let state = step(createBattle(config, 1, scenario(2250)), [
      cast("Q", ["a"], 0, 0, "c1", "p1", "b"),
    ]).state;
    // Target rushes into the charging squad while it has moved less than 2 tiles.
    const result = step(state, [move("b", -10000, 0, 1, 1, "enemy")]);
    state = result.state;
    const later = replay(state, frames(10));
    expect(later.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(false);
    expect(
      later.events.some(
        (e) =>
          e.type === "CHARGE_CANCELLED" && e.reason === "INSUFFICIENT_RUNUP",
      ),
    ).toBe(true);
  });
  it("R boosts actual Q shock and extends once when it causes rout", () => {
    const setup = scenario(5000);
    setup.squads!.find((s) => s.id === "b")!.morale = 9;
    let state = step(createBattle(config, 1, setup), [
      cast("R"),
      cast("Q", ["a"], 0, 1, "c1", "p1", "b"),
    ]).state;
    const first = replay(state, frames(20));
    expect(first.events.find((e) => e.type === "CHARGE_IMPACT")).toMatchObject({
      delta: -20,
      moraleDelta: -10,
    });
    expect(
      first.events.filter((e) => e.type === "SKILL_EFFECT_EXTENDED"),
    ).toHaveLength(1);
    expect(first.state.skillEffects.find((e) => e.skill === "R")).toMatchObject(
      { expiresAt: 90, extensionsUsed: 1 },
    );
    // Another actual charge can cause another rout during the same cast, but no second extension.
    state = structuredClone(first.state);
    chief(state).cooldownTicks.Q = 0;
    unit(state, "b").morale = 9;
    unit(state, "b").fsmState = "IDLE";
    unit(state, "b").statusRemainingTicks = 0;
    unit(state, "b").position = { x: unit(state).position.x + 3000, y: 0 };
    unit(state, "b").anchor = { ...unit(state, "b").position };
    unit(state).order = null;
    unit(state).currentTargetId = null;
    unit(state).facing = { x: 1, y: 0 };
    const second = step(state, [
      cast("Q", ["a"], state.tick, state.tick, "c1", "p1", "b"),
    ]);
    const result = replay(second.state, frames(15));
    expect(result.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(true);
    expect(
      result.events.filter((e) => e.type === "SKILL_EFFECT_EXTENDED"),
    ).toHaveLength(0);
    expect(
      result.state.skillEffects.find((e) => e.skill === "R")!.expiresAt,
    ).toBe(90);
  });
  it("injury cancels an already-started charge and removes R from all recipients", () => {
    const setup = scenario(5000);
    setup.commanders![0]!.hpMilli = 1;
    setup.squads!.find((s) => s.id === "b")!.unitType = "archers";
    const result = step(createBattle(config, 1, setup), [
      cast("R", ["a", "a2", "a3"]),
      cast("Q", ["a"], 0, 1, "c1", "p1", "b"),
    ]);
    expect(result.events.some((e) => e.type === "COMMANDER_WOUNDED")).toBe(
      true,
    );
    expect(result.events.some((e) => e.type === "CHARGE_STARTED")).toBe(true);
    expect(
      result.events.some(
        (e) =>
          e.type === "CHARGE_CANCELLED" &&
          e.reason === "SOURCE_OR_SQUAD_DISABLED",
      ),
    ).toBe(true);
    expect(unit(result.state).charge).toBeNull();
    expect(result.state.skillEffects).toHaveLength(0);
    expect(
      replay(result.state, frames(30)).events.some(
        (e) => e.type === "CHARGE_IMPACT",
      ),
    ).toBe(false);
  });
  it("checks actual diagonal travel before a swept collision", () => {
    const setup = scenario(3000);
    setup.squads!.find((s) => s.id === "b")!.position = { x: 3000, y: 3000 };
    const initial = step(createBattle(config, 1, setup), [
      cast("Q", ["a"], 0, 0, "c1", "p1", "b"),
    ]);
    expect(initial.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(false);
    const result = replay(initial.state, frames(30));
    expect(
      result.events.filter((e) => e.type === "CHARGE_IMPACT"),
    ).toHaveLength(1);
  });
  it("Q cooldown rejects tick 249 and permits tick 250 after a valid new run-up", () => {
    let state = replay(
      step(createBattle(config, 1, scenario(5000)), [
        cast("Q", ["a"], 0, 0, "c1", "p1", "b"),
      ]).state,
      frames(248),
    ).state;
    expect(state.tick).toBe(249);
    // Restore a valid living target to isolate the cooldown boundary from the prior battle.
    Object.assign(unit(state, "b"), {
      hpMilli: 2000000,
      morale: 100,
      cohesion: 100,
      fsmState: "IDLE",
      statusRemainingTicks: 0,
    });
    unit(state, "b").position = { x: unit(state).position.x + 3000, y: 0 };
    unit(state, "b").anchor = { ...unit(state, "b").position };
    unit(state).facing = { x: 1, y: 0 };
    const denied = step(state, [cast("Q", ["a"], 249, 249, "c1", "p1", "b")]);
    expect(
      denied.events.find((e) => e.type === "COMMAND_REJECTED")!.reason,
    ).toBe("COOLDOWN");
    const allowed = step(denied.state, [
      cast("Q", ["a"], 250, 250, "c1", "p1", "b"),
    ]);
    expect(allowed.events.filter((e) => e.type === "COMMAND_REJECTED")).toEqual(
      [],
    );
    expect(allowed.events.some((e) => e.type === "CHARGE_STARTED")).toBe(true);
  });
  it("does not extend R for a rout caused by a squad outside its recipient set", () => {
    const setup = scenario(5000);
    setup.squads!.find((s) => s.id === "b")!.morale = 7;
    const initial = step(createBattle(config, 1, setup), [
      cast("R", ["a2"]),
      cast("Q", ["a"], 0, 1, "c1", "p1", "b"),
    ]);
    const result = replay(initial.state, frames(25));
    expect(
      result.events.some((e) => e.type === "SQUAD_ROUTED" && e.actorId === "b"),
    ).toBe(true);
    expect(result.events.some((e) => e.type === "SKILL_EFFECT_EXTENDED")).toBe(
      false,
    );
    expect(
      result.state.skillEffects.find((e) => e.skill === "R")!.extensionsUsed,
    ).toBe(0);
  });
  it("AI never auto-casts skills or synthesizes charge events", () => {
    const result = replay(createBattle(config, 1, scenario(1000)), frames(100));
    expect(
      result.events.some(
        (e) =>
          e.type === "SKILL_CAST" ||
          e.type === "CHARGE_IMPACT" ||
          e.type === "CHARGE_STARTED",
      ),
    ).toBe(false);
    expect(
      result.state.commanders.every((c) =>
        Object.values(c.cooldownTicks).every((t) => t === 0),
      ),
    ).toBe(true);
  });
});

it(
  "replays 1000 ticks of commander and skill commands deterministically without input mutation",
  { timeout: 15000 },
  () => {
    const initial = createBattle(config, 42, scenario(5000));
    const inputs: BattleInput[][] = Array.from({ length: 1000 }, (_, tick) => {
      if (tick === 0)
        return [
          cast("R"),
          cast("W", ["a"], 0, 1),
          cast("Q", ["a"], 0, 2, "c1", "p1", "b"),
        ];
      if (tick === 100) return [reassign("a2", tick)];
      if (tick === 200) return [move("a2", 7000, 3000, tick)];
      if (tick === 400) return [cast("W", ["a2"], tick)];
      return [];
    });
    const original = canonicalJson(initial),
      commands = canonicalJson(inputs);
    function freeze(value: unknown): void {
      if (value && typeof value === "object") {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
    }
    freeze(initial);
    freeze(inputs);
    const first = replay(initial, inputs),
      second = replay(
        initial,
        inputs.map((frame) => [...frame].reverse()),
      );
    expect(first.stateHash).toBe(second.stateHash);
    expect(first.eventHash).toBe(second.eventHash);
    expect(first.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(true);
    expect(first.state.tick).toBe(1000);
    expect(canonicalJson(initial)).toBe(original);
    expect(canonicalJson(inputs)).toBe(commands);
    for (const c of first.state.commanders) {
      expect(c.hpMilli).toBeGreaterThanOrEqual(0);
      expect(c.hpMilli).toBeLessThanOrEqual(c.maxHpMilli);
      expect(Object.values(c.cooldownTicks).every(Number.isSafeInteger)).toBe(
        true,
      );
      expect(c.respawnRemainingTicks).toBeGreaterThanOrEqual(0);
    }
  },
);
