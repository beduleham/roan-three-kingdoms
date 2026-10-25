import { describe, expect, it } from "vitest";
import {
  createBattle,
  step,
  livingSoldiers,
  applyBp,
  calculateDamage,
  replay,
  hashReplayValue,
  canonicalJson,
} from "../src/index.js";
import type { BattleInput, BattleScenario, BattleState } from "../src/index.js";
import { loadBattleConfig } from "../src/node.js";

const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
function scenario(hp = 2000000): BattleScenario {
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
        maxSoldiers: 20,
        hpMilli: hp,
      },
      {
        id: "b",
        ownerPlayerId: "p2",
        nationId: "n2",
        unitType: "infantry",
        maxSoldiers: 20,
        hpMilli: hp,
      },
    ],
    commanders: [
      {
        id: "c1",
        ownerPlayerId: "p1",
        assignedSquadId: "a",
        hpMilli: 450000,
        maxHpMilli: 450000,
      },
    ],
    contacts: [
      { attackerId: "a", targetId: "b" },
      { attackerId: "b", targetId: "a" },
    ],
  };
}
function attack(
  tick = 0,
  playerId = "p1",
  squadId = "a",
  target = "b",
  seq = tick,
): BattleInput {
  return {
    playerId,
    command: {
      type: "ATTACK",
      seq,
      requestedTick: tick,
      squadIds: [squadId],
      targetSquadId: target,
    },
  };
}
function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
}
describe("Phase 1 deterministic battle core", () => {
  it("creates an empty deterministic battle without scenario assumptions", () => {
    expect(createBattle(config, 42)).toEqual(createBattle(config, 42));
    expect(step(createBattle(config, 42), []).state.tick).toBe(1);
  });
  it("deals exactly 6720 hpMilli from 20 infantry in one 100ms tick", () => {
    const initial = createBattle(config, 42, scenario());
    const { state, events } = step(initial, [attack()]);
    expect(state.squads[1]!.hpMilli).toBe(2000000 - 6720);
    expect(events.find((e) => e.type === "ATTACK_HIT")!.delta).toBe(-6720);
    expect(state.tick).toBe(1);
  });
  it("applies mutually lethal hits simultaneously, regardless of iteration order", () => {
    const initial = createBattle(config, 42, scenario(1));
    const commands = [attack(), attack(0, "p2", "b", "a")];
    const result = step(initial, commands);
    expect(result.state.squads.map((s) => s.hpMilli)).toEqual([0, 0]);
    expect(result.state.squads.map((s) => s.fsmState)).toEqual([
      "DEFEATED",
      "DEFEATED",
    ]);
    expect(result.events.filter((e) => e.type === "ATTACK_HIT")).toHaveLength(
      2,
    );
    expect(
      result.events.filter((e) => e.type === "SQUAD_DEFEATED"),
    ).toHaveLength(2);
    expect(step(initial, commands.reverse())).toEqual(result);
  });
  it("rejects another player's squad without changing combat state", () => {
    const initial = createBattle(config, 42, scenario());
    const { state, events } = step(initial, [attack(0, "p2")]);
    expect(events[0]!.reason).toBe("NOT_OWNER");
    expect(state).toEqual(step(initial, []).state);
    expect(state.players).toEqual(initial.players);
  });
  it("rejects an entire mixed-ownership command atomically", () => {
    const command = attack();
    command.command.squadIds = ["a", "b"];
    const initial = createBattle(config, 42, scenario());
    const result = step(initial, [command]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.reason).toBe("NOT_OWNER");
    expect(result.state).toEqual(step(initial, []).state);
  });
  it("rejects unsupported commands, absent contact, stale seq and wrong tick", () => {
    const initial = createBattle(config, 42, scenario());
    expect(
      step(initial, [
        {
          ...attack(),
          command: { ...attack().command, type: "MOVE" },
        } as unknown as BattleInput,
      ]).events[0]!.reason,
    ).toBe("INVALID_COMMAND");
    const noContact = createBattle(config, 42, { ...scenario(), contacts: [] });
    expect(step(noContact, [attack()]).events[0]!.reason).toBe("NO_CONTACT");
    expect(step(initial, [attack(1)]).events[0]!.reason).toBe("WRONG_TICK");
    const next = step(initial, [attack()]).state;
    expect(step(next, [attack(1, "p1", "a", "b", 0)]).events[0]!.reason).toBe(
      "STALE_SEQ",
    );
  });
  it("rejects all same-sequence conflicts deterministically", () => {
    const initial = createBattle(config, 42, scenario());
    const a = attack(),
      b = attack();
    b.command.squadIds = ["b"];
    expect(step(initial, [a, b])).toEqual(step(initial, [b, a]));
    expect(
      step(initial, [a, b]).events.every((e) => e.reason === "DUPLICATE_SEQ"),
    ).toBe(true);
  });
  it("sorts seq before player, emits one hit for repeated same-squad intents", () => {
    const initial = createBattle(config, 42, scenario());
    const inputs = [
      attack(0, "p1", "a", "b", 3),
      attack(0, "p2", "b", "a", 1),
      attack(0, "p1", "a", "b", 2),
    ];
    const result = step(initial, inputs);
    expect(
      result.events
        .filter((e) => e.type === "ORDER_ACCEPTED")
        .map((e) => e.sourceCommandSeq),
    ).toEqual([1, 2, 3]);
    expect(result.events.filter((e) => e.type === "ATTACK_HIT")).toHaveLength(
      2,
    );
    expect(step(initial, [...inputs].reverse())).toEqual(result);
  });
  it("never mutates config, scenario, input state or command arrays", () => {
    const setup = scenario(),
      original = structuredClone(setup),
      cfg = structuredClone(config);
    freeze(setup);
    freeze(cfg);
    const state = createBattle(cfg, 42, setup);
    const commands = [attack()];
    const before = canonicalJson(state);
    freeze(state);
    freeze(commands);
    const result = step(state, commands);
    expect(canonicalJson(state)).toBe(before);
    expect(setup).toEqual(original);
    expect(cfg).toEqual(config);
    expect(result.state).not.toBe(state);
  });
  it("derives living soldiers by ceiling, preserving fractional HP", () => {
    expect(
      [0, 1, 99999, 100000, 100001].map((hpMilli) =>
        livingSoldiers({ hpMilli }, config),
      ),
    ).toEqual([0, 1, 1, 1, 2]);
  });
  it("uses integer half-up BP rounding and BigInt intermediates", () => {
    expect(applyBp(1, 5000)).toBe(1);
    expect(applyBp(Number.MAX_SAFE_INTEGER, 10000)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => applyBp(-1, 10000)).toThrow();
    expect(() => applyBp(1.5, 10000)).toThrow();
    expect(() => applyBp(Number.MAX_SAFE_INTEGER, 20000)).toThrow();
  });
  it("applies directional shock once per continuous successful contact", () => {
    const setup = scenario();
    setup.contacts![0]!.direction = "rear";
    const initial = createBattle(config, 42, setup);
    const first = step(initial, [attack()]).state;
    expect(first.squads[1]!.morale).toBe(92);
    expect(first.squads[1]!.cohesion).toBe(88);
    expect(first.squads[1]!.hpMilli).toBeLessThan(2000000 - 6720);
    const second = step(first, [attack(1)]).state;
    expect(second.squads[1]!.morale).toBe(92);
    const gap = step(second, []).state;
    expect(step(gap, [attack(3)]).state.squads[1]!.morale).toBe(84);
  });
  it("uses prepared spear matchup only for front-facing defense formation", () => {
    const state = createBattle(config, 42, scenario());
    const a = { ...state.squads[0]!, unitType: "cavalry" as const };
    const b = {
      ...state.squads[1]!,
      unitType: "spears" as const,
      formation: "defense" as const,
    };
    const front = {
      attackerId: "a",
      targetId: "b",
      direction: "front" as const,
      preparedSpear: true,
    };
    expect(calculateDamage(a, b, front, config)).toBeLessThan(
      calculateDamage(a, b, { ...front, preparedSpear: false }, config),
    );
    const flank = { ...front, direction: "flank" as const };
    expect(calculateDamage(a, b, flank, config)).toBe(
      calculateDamage(a, b, { ...flank, preparedSpear: false }, config),
    );
  });
  it("prioritizes rout over break, clamps numbers and rejects forced-state orders", () => {
    const setup = scenario();
    setup.contacts![0]!.direction = "rear";
    setup.squads![1]!.morale = 1;
    setup.squads![1]!.cohesion = 1;
    const result = step(createBattle(config, 42, setup), [attack()]);
    const b = result.state.squads[1]!;
    expect([b.morale, b.cohesion, b.statusRemainingTicks]).toEqual([0, 0, 40]);
    expect(b.fsmState).toBe("ROUTED");
    expect(
      step(result.state, [attack(1, "p2", "b", "a")]).events[0]!.reason,
    ).toBe("FORCED_STATE");
  });
  it("blocks attacks for the entire 40-tick rout and recovers only when safe", () => {
    const setup = scenario();
    setup.squads![1]!.morale = 0;
    setup.squads![1]!.safe = true;
    let state = createBattle(config, 42, setup);
    for (let tick = 0; tick < 40; tick++) {
      const result = step(state, [attack(tick, "p2", "b", "a")]);
      expect(result.events.some((e) => e.type === "ATTACK_HIT")).toBe(false);
      state = result.state;
    }
    expect(state.squads[1]!.morale).toBe(25);
    expect(
      step(state, [attack(40, "p2", "b", "a")]).events.some(
        (e) => e.type === "ATTACK_HIT",
      ),
    ).toBe(true);
    setup.squads![1]!.safe = false;
    state = replay(
      createBattle(config, 42, setup),
      Array.from({ length: 41 }, () => []),
    ).state;
    expect(state.squads[1]!.fsmState).toBe("ROUTED");
  });
  it("does not grant an attack window when rout recovery leaves zero cohesion", () => {
    const setup = scenario();
    setup.squads![1]!.morale = 0;
    setup.squads![1]!.cohesion = 0;
    setup.squads![1]!.safe = true;
    const state = replay(
      createBattle(config, 42, setup),
      Array.from({ length: 40 }, () => []),
    ).state;
    expect(state.squads[1]!.fsmState).toBe("BROKEN");
    expect(state.squads[1]!.statusRemainingTicks).toBe(25);
    expect(step(state, [attack(40, "p2", "b", "a")]).events[0]!.reason).toBe(
      "FORCED_STATE",
    );
  });

  it("break lasts 25 ticks and then grants 60 ticks of immunity", () => {
    const setup = scenario();
    setup.squads![1]!.cohesion = 0;
    const isolatedConfig = structuredClone(config);
    isolatedConfig.status.cohesionRecoveryPerSecond = 0;
    let state = createBattle(isolatedConfig, 42, setup);
    for (let tick = 0; tick < 25; tick++) {
      const result = step(state, [attack(tick, "p2", "b", "a")]);
      expect(result.events.some((e) => e.type === "ATTACK_HIT")).toBe(false);
      state = result.state;
    }
    expect(state.squads[1]!.cohesion).toBe(20);
    expect(state.squads[1]!.breakImmunityTicks).toBe(60);
    state.squads[1]!.cohesion = 0; // trusted snapshot: damage during immunity
    for (let tick = 0; tick < 59; tick++) {
      state = step(state, []).state;
      expect(state.squads[1]!.fsmState).toBe("IDLE");
    }
    state = step(state, []).state;
    expect(state.squads[1]!.breakImmunityTicks).toBe(0);
    expect(state.squads[1]!.fsmState).toBe("BROKEN");
  });
  it.each([-1, 0.1, NaN, Infinity, 2000001])(
    "rejects invalid initial HP %s",
    (hp) => {
      expect(() => createBattle(config, 42, scenario(hp))).toThrow();
    },
  );
  it("rejects invalid ownership, duplicate IDs and rank limits", () => {
    const setup = scenario();
    setup.squads![0]!.ownerPlayerId = "missing";
    expect(() => createBattle(config, 42, setup)).toThrow();
    const duplicate = scenario();
    duplicate.squads!.push(duplicate.squads![0]!);
    expect(() => createBattle(config, 42, duplicate)).toThrow("Duplicate");
    expect(() => createBattle(config, 42, scenario(2000000 + 1))).toThrow();
  });
  it("recovers integer morale and cohesion with delay, remainder and saturation", () => {
    const setup = scenario();
    setup.squads![0]!.morale = 99;
    setup.squads![0]!.cohesion = 98;
    setup.squads![0]!.safe = true;
    let state = replay(
      createBattle(config, 42, setup),
      Array.from({ length: 29 }, () => []),
    ).state;
    expect(state.squads[0]!.cohesion).toBe(98);
    expect(state.squads[0]!.morale).toBe(100);
    state = replay(
      state,
      Array.from({ length: 5 }, () => []),
    ).state;
    expect(state.squads[0]!.cohesion).toBe(100);
    expect(state.squads[0]!.cohesionRecoveryRemainder).toBe(0);
    state = step(state, [attack(state.tick, "p2", "b", "a")]).state;
    expect(state.squads[0]!.ticksSinceDamage).toBe(0);
  });

  it("rejects troop counts over rank capacity even when HP is locally valid", () => {
    const setup = scenario();
    setup.squads![0]!.maxSoldiers = 41;
    setup.squads![0]!.hpMilli = 4100000;
    expect(() => createBattle(config, 42, setup)).toThrow("Rank capacity");
  });

  it("replays 1000 ticks with identical state/event hashes and bounded values", () => {
    const initial = createBattle(config, 42, scenario());
    const frames = Array.from({ length: 1000 }, (_, tick) => [
      attack(tick),
      attack(tick, "p2", "b", "a"),
    ]);
    const a = replay(initial, frames),
      b = replay(
        createBattle(config, 42, scenario()),
        frames.map((frame) => [...frame].reverse()),
      );
    expect(a.state.tick).toBe(1000);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.eventHash).toBe(b.eventHash);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
    expect(
      a.events.filter((e) => e.type === "ATTACK_HIT").length,
    ).toBeGreaterThan(100);
    let state: BattleState = initial;
    for (const frame of frames) {
      state = step(state, frame).state;
      for (const s of state.squads) {
        expect(Number.isSafeInteger(s.hpMilli)).toBe(true);
        expect(s.hpMilli).toBeGreaterThanOrEqual(0);
        expect(s.hpMilli).toBeLessThanOrEqual(s.maxSoldiers * 100000);
        expect(livingSoldiers(s, config)).toBeLessThanOrEqual(s.maxSoldiers);
        for (const value of [s.morale, s.cohesion]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
        }
        expect(s.statusRemainingTicks).toBeGreaterThanOrEqual(0);
        expect(s.breakImmunityTicks).toBeGreaterThanOrEqual(0);
      }
    }
    expect(hashReplayValue({ a: 1, b: 2 })).toBe(
      hashReplayValue({ b: 2, a: 1 }),
    );
    expect(hashReplayValue(a.state)).not.toBe(
      hashReplayValue({ ...a.state, tick: 1001 }),
    );
  });
});
