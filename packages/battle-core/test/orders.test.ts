import { describe, expect, it } from "vitest";
import { createBattle, step, replay, calculateDamage } from "../src/index.js";
import type {
  BattleInput,
  BattleScenario,
  BattleState,
  Squad,
} from "../src/index.js";
import { loadBattleConfig } from "../src/node.js";
import {
  contactFor,
  distanceSquared,
  moveTowards,
  rangeUnits,
  within,
} from "../src/spatial.js";

const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
function setup(enemyX = 20000, enemyY = 0): BattleScenario {
  return {
    players: [
      { id: "p1", nationId: "n1" },
      { id: "p2", nationId: "n2" },
    ],
    squads: [
      {
        id: "a",
        ownerPlayerId: "p1",
        nationId: "n1",
        unitType: "infantry",
        hpMilli: 2000000,
        maxSoldiers: 20,
        position: { x: 0, y: 0 },
        facing: { x: 1, y: 0 },
      },
      {
        id: "b",
        ownerPlayerId: "p2",
        nationId: "n2",
        unitType: "infantry",
        hpMilli: 2000000,
        maxSoldiers: 20,
        position: { x: enemyX, y: enemyY },
        facing: { x: -1, y: 0 },
        stance: "defensive",
      },
    ],
  };
}
type Payload =
  | { type: "ATTACK"; targetSquadId: string }
  | {
      type: "MOVE" | "ATTACK_MOVE" | "RETREAT";
      destination: { x: number; y: number };
    }
  | { type: "SET_STANCE"; stance: Squad["stance"] }
  | { type: "SET_FORMATION"; formation: Squad["formation"] };
function command(
  payload: Payload,
  tick = 0,
  seq = tick,
  squadId = "a",
  playerId = "p1",
): BattleInput {
  return {
    playerId,
    command: { ...payload, seq, requestedTick: tick, squadIds: [squadId] },
  };
}
const idleFrames = (n: number) => Array.from({ length: n }, () => []);
function frozen(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(frozen);
  }
}

describe("Phase 2 orders, space and AI", () => {
  it.each([
    ["infantry", 200],
    ["spears", 180],
    ["archers", 190],
    ["cavalry", 320],
  ] as const)(
    "moves %s at configured speed without overshooting",
    (unitType, speed) => {
      const scenario = setup();
      scenario.squads![0]!.unitType = unitType;
      let state = step(createBattle(config, 1, scenario), [
        command({ type: "MOVE", destination: { x: 1000, y: 0 } }),
      ]).state;
      expect(state.squads[0]!.position).toEqual({ x: speed, y: 0 });
      state = replay(state, idleFrames(10)).state;
      expect(state.squads[0]!.position).toEqual({ x: 1000, y: 0 });
      expect(state.squads[0]!.anchor).toEqual({ x: 1000, y: 0 });
      expect(state.squads[0]!.fsmState).toBe("IDLE");
      expect(state.squads[0]!.order).toBeNull();
    },
  );
  it("uses bounded integer diagonal steps and reaches the exact destination", () => {
    let position = { x: 0, y: 0 };
    for (let tick = 0; tick < 10; tick++) {
      const next = moveTowards(position, { x: 1000, y: -1000 }, 200);
      expect(distanceSquared(position, next)).toBeLessThanOrEqual(40000n);
      expect(Number.isSafeInteger(next.x) && Number.isSafeInteger(next.y)).toBe(
        true,
      );
      position = next;
    }
    expect(position).toEqual({ x: 1000, y: -1000 });
    expect(moveTowards({ x: 0, y: 0 }, { x: 1, y: 1 }, 1)).toEqual({
      x: 1,
      y: 0,
    });
  });
  it("cannot attack outside actual range and ATTACK persists after one input", () => {
    let state = step(createBattle(config, 1, setup(3000)), [
      command({ type: "ATTACK", targetSquadId: "b" }),
    ]).state;
    expect(state.squads[1]!.hpMilli).toBe(2000000);
    expect(state.squads[0]!.fsmState).toBe("CHASE");
    const result = replay(state, idleFrames(20));
    const hits = result.events.filter(
      (e) => e.type === "ATTACK_HIT" && e.actorId === "a",
    );
    expect(hits.length).toBeGreaterThan(2);
    expect(result.state.squads[0]!.order?.type).toBe("ATTACK");
    expect(
      within(
        result.state.squads[0]!.position,
        result.state.squads[1]!.position,
        1000,
      ),
    ).toBe(true);
  });
  it("uses post-movement positions so a retreating enemy cannot be hit through stale range", () => {
    const scenario = setup(1000);
    scenario.squads![0]!.stance = "defensive";
    const result = step(createBattle(config, 1, scenario), [
      command({ type: "ATTACK", targetSquadId: "b" }),
      command(
        { type: "MOVE", destination: { x: 3000, y: 0 } },
        0,
        0,
        "b",
        "p2",
      ),
    ]);
    expect(result.events.filter((e) => e.type === "ATTACK_HIT")).toHaveLength(
      0,
    );
  });
  it("balanced pursuit never crosses five tiles and returns fully to Anchor", () => {
    const scenario = setup(4500);
    scenario.squads![1]!.unitType = "cavalry";
    let state = createBattle(config, 1, scenario);
    state = replay(state, idleFrames(10)).state;
    expect(state.squads[0]!.position.x).toBeGreaterThan(0);
    state = step(state, [
      command(
        { type: "MOVE", destination: { x: 15000, y: 0 } },
        10,
        0,
        "b",
        "p2",
      ),
    ]).state;
    let returned = false;
    for (let i = 0; i < 100; i++) {
      state = step(state, []).state;
      expect(
        distanceSquared(state.squads[0]!.position, state.squads[0]!.anchor),
      ).toBeLessThanOrEqual(25000000n);
      returned ||= state.squads[0]!.fsmState === "RETURN";
    }
    expect(returned).toBe(true);
    expect(state.squads[0]!.position).toEqual({ x: 0, y: 0 });
    expect(state.squads[0]!.fsmState).toBe("IDLE");
  });
  it.each([
    ["defensive", false],
    ["balanced", false],
    ["aggressive", true],
  ] as const)(
    "respects %s acquisition/leash at eight tiles",
    (stance, shouldChase) => {
      const scenario = setup(8000);
      scenario.squads![0]!.stance = stance;
      const state = step(createBattle(config, 1, scenario), []).state;
      expect(state.squads[0]!.position.x > 0).toBe(shouldChase);
    },
  );
  it("defensive never pursues but attacks within its own weapon range", () => {
    const scenario = setup(1500);
    scenario.squads![0]!.stance = "defensive";
    let state = replay(createBattle(config, 1, scenario), idleFrames(5)).state;
    expect(state.squads[0]!.position.x).toBe(0);
    expect(state.squads[1]!.hpMilli).toBe(2000000);
    state.squads[1]!.position.x = 1000;
    state.squads[1]!.anchor.x = 1000;
    const result = step(state, []);
    expect(
      result.events.some((e) => e.actorId === "a" && e.type === "ATTACK_HIT"),
    ).toBe(true);
    expect(result.state.squads[0]!.position.x).toBe(0);
  });
  it.each(["MOVE", "RETREAT"] as const)(
    "%s immediately cancels automatic chase",
    (type) => {
      let state = step(createBattle(config, 1, setup(4000)), []).state;
      expect(state.squads[0]!.fsmState).toBe("CHASE");
      const result = step(state, [
        command({ type, destination: { x: -1000, y: 0 } }, 1),
      ]);
      expect(result.state.squads[0]!.position.x).toBeLessThan(
        state.squads[0]!.position.x,
      );
      expect(result.state.squads[0]!.currentTargetId).toBeNull();
      expect(
        result.events.filter(
          (e) => e.actorId === "a" && e.type === "ATTACK_HIT",
        ),
      ).toHaveLength(0);
      state = replay(result.state, idleFrames(7)).state;
      expect(state.squads[0]!.order).toBeNull();
      if (type === "RETREAT") expect(state.squads[0]!.fsmState).toBe("REGROUP");
    },
  );
  it("ATTACK_MOVE pauses for combat and resumes its destination when the target disappears", () => {
    const scenario = setup(4000);
    let state = step(createBattle(config, 1, scenario), [
      command({ type: "ATTACK_MOVE", destination: { x: 10000, y: 0 } }),
    ]).state;
    expect(state.squads[0]!.fsmState).toBe("CHASE");
    expect(state.squads[0]!.order?.type).toBe("ATTACK_MOVE");
    state.squads[1]!.hpMilli = 0;
    state.squads[1]!.fsmState = "DEFEATED";
    state = replay(state, idleFrames(60)).state;
    expect(state.squads[0]!.position.x).toBe(10000);
    expect(state.squads[0]!.order).toBeNull();
  });
  it("safely rejects invalid position, ownership and duplicate sequence without consuming order", () => {
    const initial = createBattle(config, 1, setup());
    const move = command({ type: "MOVE", destination: { x: 3000, y: 0 } });
    const invalid = {
      ...move,
      command: { ...move.command, destination: { x: NaN, y: 0 } },
    } as BattleInput;
    expect(step(initial, [invalid]).events[0]!.reason).toBe("INVALID_COMMAND");
    expect(step(initial, [{ ...move, playerId: "p2" }]).events[0]!.reason).toBe(
      "NOT_OWNER",
    );
    const duplicate = step(initial, [move, move]);
    expect(
      duplicate.events.filter((e) => e.reason === "DUPLICATE_SEQ"),
    ).toHaveLength(2);
    expect(duplicate.state.squads[0]!.order).toBeNull();
    const accepted = step(initial, [move]).state;
    expect(
      step(accepted, [
        { ...move, command: { ...move.command, requestedTick: 1 } },
      ]).events[0]!.reason,
    ).toBe("STALE_SEQ");
  });
  it.each(["ROUTED", "BROKEN"] as const)(
    "%s blocks all six command classes and clears existing orders",
    (status) => {
      const scenario = setup();
      if (status === "ROUTED") scenario.squads![0]!.morale = 0;
      else scenario.squads![0]!.cohesion = 0;
      const initial = createBattle(config, 1, scenario);
      const payloads: Payload[] = [
        { type: "MOVE", destination: { x: 1000, y: 0 } },
        { type: "RETREAT", destination: { x: 1000, y: 0 } },
        { type: "ATTACK_MOVE", destination: { x: 1000, y: 0 } },
        { type: "ATTACK", targetSquadId: "b" },
        { type: "SET_STANCE", stance: "aggressive" },
        { type: "SET_FORMATION", formation: "defense" },
      ];
      for (const payload of payloads) {
        const result = step(initial, [command(payload)]);
        expect(result.events[0]!.reason).toBe("FORCED_STATE");
        expect(result.state.squads[0]!.order).toBeNull();
        expect(result.state.squads[0]!.fsmState).toBe(status);
      }
    },
  );
  it("rout walks to a friendly safe zone and recovers into regroup after 40 ticks", () => {
    const scenario = setup();
    scenario.squads![0]!.morale = 0;
    scenario.safeZones = [
      { nationId: "n1", position: { x: -3000, y: 0 }, radiusUnits: 0 },
    ];
    const initial = createBattle(config, 1, scenario);
    expect(step(initial, []).state.squads[0]!.position.x).toBe(-200);
    let state = replay(initial, idleFrames(40)).state;
    expect(state.squads[0]!.position.x).toBe(-3000);
    expect(state.squads[0]!.fsmState).toBe("REGROUP");
    expect(state.squads[0]!.morale).toBe(25);
    state = replay(state, idleFrames(30)).state;
    expect(state.squads[0]!.fsmState).toBe("IDLE");
  });
  it("formation changes take a full 15 ticks; movement and damage bonuses apply only afterward", () => {
    let state = createBattle(config, 1, setup());
    const first = step(state, [
      command({ type: "MOVE", destination: { x: 10000, y: 0 } }, 0, 0),
      command({ type: "SET_FORMATION", formation: "defense" }, 0, 1),
    ]);
    state = first.state;
    expect(state.squads[0]!.position.x).toBe(200);
    expect(state.squads[0]!.formation).toBe("normal");
    expect(state.squads[0]!.formationRemainingTicks).toBe(14);
    state = replay(state, idleFrames(13)).state;
    expect(state.squads[0]!.formation).toBe("normal");
    expect(state.squads[0]!.position.x).toBe(2800);
    state = step(state, []).state;
    expect(state.squads[0]!.formation).toBe("defense");
    expect(state.squads[0]!.position.x).toBe(3000);
    state = step(state, []).state;
    expect(state.squads[0]!.position.x).toBe(3160);
    const normal = { ...state.squads[0]!, formation: "normal" as const };
    const other = state.squads[1]!;
    const contact = contactFor(other, normal);
    expect(
      calculateDamage(other, state.squads[0]!, contact, config),
    ).toBeLessThan(calculateDamage(other, normal, contact, config));
  });
  it("changes actual incoming damage only after the fifteenth complete tick", () => {
    const scenario = setup(1000);
    scenario.squads![0]!.stance = "defensive";
    let state = createBattle(config, 1, scenario);
    for (let tick = 0; tick < 16; tick++) {
      const attacker = state.squads[1]!,
        defender = state.squads[0]!;
      expect(defender.formation).toBe(tick < 15 ? "normal" : "defense");
      const expected = calculateDamage(
        attacker,
        defender,
        contactFor(attacker, defender),
        config,
      );
      const result = step(
        state,
        tick === 0
          ? [command({ type: "SET_FORMATION", formation: "defense" })]
          : [],
      );
      expect(
        result.events.find((e) => e.type === "ATTACK_HIT" && e.actorId === "b")!
          .delta,
      ).toBe(-expected);
      expect(result.events.some((e) => e.type === "FORMATION_COMPLETED")).toBe(
        tick === 14,
      );
      state = result.state;
    }
  });

  it("repeating a pending formation does not restart its timer; forced state cancels it", () => {
    let state = step(createBattle(config, 1, setup()), [
      command({ type: "SET_FORMATION", formation: "defense" }),
    ]).state;
    state = step(state, [
      command({ type: "SET_FORMATION", formation: "defense" }, 1),
    ]).state;
    expect(state.squads[0]!.formationRemainingTicks).toBe(13);
    state.squads[0]!.morale = 0;
    state.squads[0]!.fsmState = "ROUTED";
    state.squads[0]!.statusRemainingTicks = 40;
    state = step(state, []).state;
    expect(state.squads[0]!.pendingFormation).toBeNull();
    expect(state.squads[0]!.formation).toBe("normal");
  });
  it("prepared spears use their own facing for both sides of cavalry matchup", () => {
    const scenario = setup(1000);
    scenario.squads![0]!.unitType = "spears";
    scenario.squads![0]!.formation = "defense";
    scenario.squads![1]!.unitType = "cavalry";
    const state = createBattle(config, 1, scenario);
    const spear = state.squads[0]!,
      cavalry = state.squads[1]!;
    expect(contactFor(cavalry, spear)).toMatchObject({
      direction: "front",
      preparedSpear: true,
    });
    expect(contactFor(spear, cavalry).preparedSpear).toBe(true);
    const frontDamage = calculateDamage(
      cavalry,
      spear,
      contactFor(cavalry, spear),
      config,
    );
    cavalry.position = { x: 0, y: 1000 };
    cavalry.anchor = { ...cavalry.position };
    expect(contactFor(cavalry, spear)).toMatchObject({
      direction: "flank",
      preparedSpear: false,
    });
    expect(contactFor(spear, cavalry).preparedSpear).toBe(false);
    expect(
      calculateDamage(cavalry, spear, contactFor(cavalry, spear), config),
    ).toBeGreaterThan(frontDamage);
    const result = step(state, []);
    expect(result.state.squads[0]!.cohesion).toBe(92);
  });
  it("cannot auto-select formations, skills, stance or strategic retreat", () => {
    const scenario = setup(3000);
    scenario.squads![0]!.formation = "offense";
    const initial = createBattle(config, 1, scenario);
    const result = replay(initial, idleFrames(100));
    expect(result.state.squads[0]!.formation).toBe("offense");
    expect(result.state.squads[0]!.stance).toBe("balanced");
    expect(result.state.squads[0]!.order).toBeNull();
    expect(
      result.events.some(
        (e) =>
          e.type === "FORMATION_COMPLETED" ||
          (e.type === "FSM_CHANGED" && e.reason === "RETREAT"),
      ),
    ).toBe(false);
    expect(
      step(initial, [
        {
          playerId: "p1",
          command: {
            type: "CAST_SKILL",
            skill: "Q",
            seq: 0,
            requestedTick: 0,
            squadIds: ["a"],
          },
        } as unknown as BattleInput,
      ]).events[0]!.reason,
    ).toBe("INVALID_COMMAND");
  });
  it("retains deterministic 1000-tick replay, input purity and entity-order independence with mixed orders", () => {
    const initial = createBattle(config, 7, setup(4000));
    const frames: BattleInput[][] = Array.from({ length: 1000 }, (_, tick) => {
      if (tick === 0)
        return [
          command({ type: "ATTACK", targetSquadId: "b" }),
          command({ type: "ATTACK", targetSquadId: "a" }, 0, 0, "b", "p2"),
        ];
      if (tick === 30)
        return [command({ type: "SET_FORMATION", formation: "defense" }, tick)];
      if (tick === 50)
        return [
          command({ type: "RETREAT", destination: { x: -2000, y: 0 } }, tick),
        ];
      if (tick === 100)
        return [
          command(
            { type: "ATTACK_MOVE", destination: { x: 4000, y: 0 } },
            tick,
          ),
        ];
      return [];
    });
    const before = structuredClone(initial);
    frozen(initial);
    frozen(frames);
    const first = replay(initial, frames);
    const shuffled = structuredClone(before);
    shuffled.squads.reverse();
    const second = replay(
      shuffled,
      frames.map((f) => [...f].reverse()),
    );
    expect(initial).toEqual(before);
    expect(first.stateHash).toBe(second.stateHash);
    expect(first.eventHash).toBe(second.eventHash);
    expect(first.state.tick).toBe(1000);
    expect(first.events.some((e) => e.type === "ATTACK_HIT")).toBe(true);
    expect(
      first.events.some(
        (e) => e.type === "FSM_CHANGED" && e.reason === "REGROUP",
      ),
    ).toBe(true);
  });
});
