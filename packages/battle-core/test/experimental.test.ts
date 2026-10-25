import { expect, it } from "vitest";
import { createBattle, step, replay } from "../src/index.js";
import type { BattleState, BattleEvent, BattleInput } from "../src/model.js";
import {
  experimentalScenario,
  experimentalFrames,
  compareExperimentalAugments,
} from "../src/experimental-scenario.js";
import { experimentalAugments } from "../src/data/experimental-v0.1.js";
import {
  augmentBonus,
  cohesionDamageBp,
  reduceCohesionDamage,
  processAugmentEvents,
  expireAugments,
} from "../src/augments.js";
import { loadBattleConfig } from "../src/node.js";
const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
const shock = "draft-shock-breakthrough",
  gale = "draft-gale-maneuver",
  discipline = "draft-legion-discipline";
function initial() {
  return createBattle(config, 17, experimentalScenario());
}
function squad(s: BattleState, id = "a") {
  return s.squads.find((s) => s.id === id)!;
}
function selected(id: string) {
  return step(initial(), experimentalFrames(id, 1)[0]!).state;
}
function event(state: BattleState, skill: "Q" | "W" = "Q"): BattleEvent {
  return {
    type: skill === "Q" ? "CHARGE_IMPACT" : "SKILL_CAST",
    actorId: skill === "Q" ? "a" : "c",
    sourceCommanderId: "c",
    sourceCommandSeq: 10,
    skill,
    tick: state.tick,
    targetSquadIds: ["a", "d"],
  };
}
function trigger(state: BattleState, skill: "Q" | "W" = "Q") {
  const events: BattleEvent[] = [];
  processAugmentEvents(state, [event(state, skill)], (e) =>
    events.push({ ...e, tick: state.tick }),
  );
  return events;
}
it("keeps operational defaults empty and preserves unspent opportunities with only three experimental candidates", () => {
  expect(createBattle(config, 1).augmentDefinitions).toEqual([]);
  expect(
    experimentalAugments.every(
      (d) =>
        d.version === "experimental-v0.1" &&
        d.designStatus === "experimental-not-balance-validated",
    ),
  ).toBe(true);
  const p = selected(shock).augmentProgress.find((p) => p.playerId === "p")!;
  expect(p.spent).toBe(1);
  expect(p.earned).toHaveLength(7);
  expect(p.offer).toBeNull();
});
it.each([shock, gale])(
  "%s only rewards actual Q impact and begins the next tick",
  (id) => {
    let s = initial();
    const frames = experimentalFrames(id, 30);
    let impacts = 0;
    for (const f of frames) {
      const before = structuredClone(s);
      const r = step(s, f);
      expect(s).toEqual(before);
      if (
        r.events.some((e) => e.type === "CHARGE_IMPACT" && e.actorId === "a")
      ) {
        impacts++;
        const effect = r.state.augmentEffects.find((e) => e.augmentId === id)!;
        expect(effect.startsAt).toBe(s.tick + 1);
        expect(effect.expiresAt).toBe(s.tick + 31);
        expect(effect.sourceCommanderId).toBe("c");
        expect(effect.skill).toBe("Q");
        expect(effect.sourceCommandSeq).toBe(2);
      } else if (!impacts) expect(r.state.augmentEffects).toEqual([]);
      s = r.state;
    }
    expect(impacts).toBe(1);
  },
);
it.each(["failure", "cancel", "duplicate"])("no reward for %s Q", (mode) => {
  const s = initial(),
    frames = experimentalFrames(shock, 30);
  if (mode === "failure") squad(s, "b").position.x = 1000;
  if (mode === "duplicate") frames[2]!.push(frames[2]![0]!);
  if (mode === "cancel")
    frames[3] = [
      {
        playerId: "p",
        command: {
          type: "MOVE",
          squadIds: ["a"],
          destination: { x: -1000, y: 0 },
          seq: 3,
          requestedTick: 3,
        },
      },
    ];
  const r = replay(s, frames);
  expect(
    r.events.filter((e) => e.type === "AUGMENT_EFFECT_APPLIED"),
  ).toHaveLength(0);
});
it("does not reward W cast before selection in the same tick", () => {
  const cast = experimentalFrames(null, 2)[1]![0]!;
  cast.command.requestedTick = 0;
  cast.command.seq = 0;
  const choice = experimentalFrames(discipline, 1)[0]![0]!;
  choice.command.seq = 1;
  expect(step(initial(), [choice, cast]).state.augmentEffects).toEqual([]);
});
it.each([
  [shock, "attack", 1500, 30],
  [gale, "speed", 1000, 30],
] as const)("%s exact start and expiration", (id, stat, bonus, duration) => {
  const s = selected(id);
  trigger(s);
  expect(augmentBonus(s, squad(s), stat)).toBe(0);
  s.tick++;
  expect(augmentBonus(s, squad(s), stat)).toBe(bonus);
  s.tick += duration - 1;
  expect(augmentBonus(s, squad(s), stat)).toBe(bonus);
  s.tick++;
  expect(augmentBonus(s, squad(s), stat)).toBe(0);
  const events: unknown[] = [];
  expireAugments(s, (e) => events.push(e));
  expect(events).toHaveLength(1);
});
it("W protects only its two accepted targets including a different owner's ally", () => {
  const s = selected(discipline),
    r = step(s, experimentalFrames(discipline, 2)[1]!);
  expect(r.state.augmentEffects.map((e) => e.squadId).sort()).toEqual([
    "a",
    "d",
  ]);
  expect(r.events.find((e) => e.type === "SKILL_CAST")!.targetSquadIds).toEqual(
    ["a", "d"],
  );
  expect(cohesionDamageBp(r.state, squad(r.state, "d"))).toBe(8000);
  expect(cohesionDamageBp(r.state, squad(r.state, "b"))).toBe(10000);
  const e = r.state.augmentEffects[0]!;
  expect(e.expiresAt).toBe(62);
  r.state.tick = 61;
  expect(cohesionDamageBp(r.state, squad(r.state))).toBe(8000);
  r.state.tick = 62;
  expect(cohesionDamageBp(r.state, squad(r.state))).toBe(10000);
});
it.each(["enemy", "too-many", "wrong-owner", "Q", "R"])(
  "discipline rejects non-W or invalid targets: %s",
  (mode) => {
    const s = selected(discipline),
      input = experimentalFrames(discipline, 2)[1]![0]!;
    if (input.command.type !== "CAST_SKILL") throw new Error("fixture");
    if (mode === "enemy") input.command.squadIds = ["b"];
    if (mode === "too-many") input.command.squadIds = ["a", "d", "b"];
    if (mode === "wrong-owner") input.playerId = "ally";
    if (mode === "Q" || mode === "R") {
      input.command.skill = mode;
      input.command.squadIds = ["a"];
      if (mode === "Q") input.command.targetSquadId = "b";
    }
    expect(step(s, [input]).state.augmentEffects).toEqual([]);
  },
);
it("deduplicates a genuine event and applies refresh/ignore per source", () => {
  for (const id of [shock, gale]) {
    const s = selected(id),
      e = event(s),
      out: unknown[] = [];
    processAugmentEvents(s, [e, e], (x) => out.push(x));
    processAugmentEvents(s, [e], (x) => out.push(x));
    expect(out).toHaveLength(1);
    const expiry = s.augmentEffects[0]!.expiresAt;
    s.tick++;
    trigger(s);
    expect(s.augmentEffects[0]!.expiresAt).toBe(
      expiry + (id === shock ? 1 : 0),
    );
    expect(s.augmentEffects[0]!.stacks).toBe(1);
  }
});
it("same discipline across sources uses max; distinct reductions respect aggregate cap and source fallback", () => {
  const s = selected(discipline);
  trigger(s, "W");
  s.tick++;
  // A second trusted commander/source; no new operational content.
  s.commanders.push({
    ...structuredClone(s.commanders.find((c) => c.id === "c")!),
    id: "ca",
    ownerPlayerId: "ally",
    assignedSquadId: "d",
  });
  const e = structuredClone(s.augmentEffects.find((e) => e.squadId === "d")!);
  s.augmentEffects.push({ ...e, playerId: "ally", sourceCommanderId: "ca" });
  expect(cohesionDamageBp(s, squad(s, "d"))).toBe(8000);
  s.commanders.find((c) => c.id === "c")!.status = "WOUNDED";
  expireAugments(s, () => {});
  expect(s.augmentEffects).toHaveLength(1);
  expect(cohesionDamageBp(s, squad(s, "d"))).toBe(8000);
  s.augmentDefinitions.push({
    ...structuredClone(s.augmentDefinitions.find((d) => d.id === discipline)!),
    id: "test-extra-reduction",
  });
  s.augmentEffects.push({
    ...s.augmentEffects[0]!,
    augmentId: "test-extra-reduction",
  });
  expect(cohesionDamageBp(s, squad(s, "d"))).toBe(7000);
});
it.each([
  "wounded",
  "reassign",
  "host-broken",
  "target-broken",
  "target-routed",
  "target-dead",
])("ends effects on %s without restoration", (mode) => {
  const s = selected(discipline);
  trigger(s, "W");
  s.tick++;
  if (mode === "wounded")
    s.commanders.find((c) => c.id === "c")!.status = "WOUNDED";
  if (mode === "reassign")
    s.commanders.find((c) => c.id === "c")!.status = "REASSIGNING";
  if (mode === "host-broken") squad(s).fsmState = "BROKEN";
  if (mode === "target-broken") squad(s, "d").fsmState = "BROKEN";
  if (mode === "target-routed") squad(s, "d").fsmState = "ROUTED";
  if (mode === "target-dead") squad(s, "d").hpMilli = 0;
  expireAugments(s, () => {});
  expect(s.augmentEffects.some((e) => e.squadId === "d")).toBe(false);
  squad(s, "d").hpMilli = 2000000;
  squad(s, "d").fsmState = "IDLE";
  expect(cohesionDamageBp(s, squad(s, "d"))).toBe(10000);
});
it("actual reassignment removes buffs before movement", () => {
  const s = selected(gale);
  trigger(s);
  s.tick++;
  // Give player a second host without changing production data.
  squad(s, "d").ownerPlayerId = "p";
  const r = step(s, [
    {
      playerId: "p",
      command: {
        type: "REASSIGN_COMMANDER",
        commanderId: "c",
        squadIds: ["d"],
        seq: 5,
        requestedTick: s.tick,
      },
    },
  ]);
  expect(r.state.augmentEffects).toEqual([]);
});
it("does not create effects when the event source is disabled at end of tick", () => {
  const s = selected(shock);
  s.commanders.find((c) => c.id === "c")!.status = "WOUNDED";
  trigger(s);
  expect(s.augmentEffects).toEqual([]);
});
it("reduces the summed cohesion pool once, with snapshot-independent final application", () => {
  expect(reduceCohesionDamage(8 + 8, 8000)).toBe(13);
  expect(reduceCohesionDamage(8, 8000) * 2).toBe(12);
  const s = selected(discipline);
  trigger(s, "W");
  s.tick++;
  // Two flank contacts in the same tick: 8+8 raw -> 13, rather than 6+6.
  const d = squad(s, "d");
  d.cohesion = 100;
  d.position = { x: 5000, y: 5000 };
  d.facing = { x: 1, y: 0 };
  squad(s, "b").position = { x: 5000, y: 5500 };
  squad(s, "e").position = { x: 5000, y: 4500 };
  const r = step(s, [
    {
      playerId: "enemy",
      command: {
        type: "ATTACK",
        squadIds: ["b", "e"],
        targetSquadId: "d",
        seq: 3,
        requestedTick: s.tick,
      },
    },
  ]);
  expect(
    r.events.filter((e) => e.type === "ATTACK_HIT" && e.targetId === "d"),
  ).toHaveLength(2);
  expect(squad(r.state, "d").cohesion).toBe(87);
});
it("Q forced-state precheck and final cohesion use the same mitigation", () => {
  for (const id of [null, discipline]) {
    const r = replay(initial(), experimentalFrames(id, 20));
    const impact = r.events.find(
      (e) => e.type === "CHARGE_IMPACT" && e.targetId === "d",
    )!;
    expect(impact).toBeDefined();
    const attacks = r.events.filter(
      (e) =>
        e.tick === impact.tick && e.type === "ATTACK_HIT" && e.actorId === "d",
    );
    expect(attacks.length > 0).toBe(id === discipline);
    expect(
      r.events.some(
        (e) =>
          e.tick === impact.tick &&
          e.type === "SQUAD_BROKEN" &&
          e.actorId === "d",
      ),
    ).toBe(id === null);
  }
});
it("same-tick W has no retroactive mitigation", () => {
  const frames = experimentalFrames(discipline, 20),
    base = replay(initial(), frames);
  const tick = base.events.find(
    (e) => e.type === "CHARGE_IMPACT" && e.targetId === "d",
  )!.tick;
  const cast = frames[1]![0]!;
  frames[1] = [];
  cast.command.seq = tick;
  cast.command.requestedTick = tick;
  frames[tick]!.push(cast);
  const r = replay(initial(), frames);
  expect(
    r.events.some(
      (e) => e.tick === tick && e.type === "SQUAD_BROKEN" && e.actorId === "d",
    ),
  ).toBe(true);
});
it(
  "compares actual damage/movement/cohesion and replays every experimental case for 1000 ticks",
  { timeout: 20000 },
  () => {
    const report = compareExperimentalAugments(config);
    expect(report.cases.every((c) => c.replayMatches)).toBe(true);
    const baseline = report.cases[0]!,
      attack = report.cases[1]!,
      speed = report.cases[2]!,
      support = report.cases[3]!;
    expect(attack.attackDamageByA).toBeGreaterThan(baseline.attackDamageByA);
    expect(
      speed.sampleSquads.find((s) => s.id === "a")!.position.x,
    ).toBeGreaterThan(
      baseline.sampleSquads.find((s) => s.id === "a")!.position.x,
    );
    expect(support.dBroken).toBeLessThan(baseline.dBroken);
  },
);
it("actual allied W casts keep separate sources without doubling reduction", () => {
  let s = initial();
  s.commanders.push({
    ...structuredClone(s.commanders.find((c) => c.id === "c")!),
    id: "ca",
    ownerPlayerId: "ally",
    assignedSquadId: "d",
    position: { ...squad(s, "d").position },
  });
  const select = experimentalFrames(discipline, 1)[0]![0]!;
  s = step(s, [select, { ...structuredClone(select), playerId: "ally" }]).state;
  const cast = experimentalFrames(discipline, 2)[1]![0]!;
  const other = structuredClone(cast);
  other.playerId = "ally";
  if (other.command.type !== "CAST_SKILL") throw new Error("fixture");
  other.command.commanderId = "ca";
  s = step(s, [cast, other]).state;
  expect(s.augmentEffects).toHaveLength(4);
  expect(new Set(s.augmentEffects.map((e) => e.sourceCommanderId))).toEqual(
    new Set(["c", "ca"]),
  );
  expect(cohesionDamageBp(s, squad(s, "d"))).toBe(8000);
});
it("W then immediate reassignment cannot recreate the earlier cast's effects", () => {
  let s = selected(discipline);
  const host = { ...structuredClone(squad(s)), id: "a2" };
  s.squads.push(host);
  const cast = experimentalFrames(discipline, 2)[1]![0]!;
  const r = step(s, [
    cast,
    {
      playerId: "p",
      command: {
        type: "REASSIGN_COMMANDER",
        commanderId: "c",
        squadIds: ["a2"],
        seq: 2,
        requestedTick: 1,
      },
    },
  ]);
  expect(r.state.commanders.find((c) => c.id === "c")!.status).toBe("ACTIVE");
  expect(r.state.augmentEffects).toEqual([]);
});
it("a physically missed charge has no augmentation reward", () => {
  const frames = experimentalFrames(shock, 35);
  frames[3] = [
    {
      playerId: "enemy",
      command: {
        type: "MOVE",
        squadIds: ["b"],
        destination: { x: 5000, y: -10000 },
        seq: 3,
        requestedTick: 3,
      },
    },
  ];
  const r = replay(initial(), frames);
  expect(
    r.events.some((e) => e.type === "CHARGE_CANCELLED" && e.actorId === "a"),
  ).toBe(true);
  expect(r.events.some((e) => e.type === "AUGMENT_EFFECT_APPLIED")).toBe(false);
});
it("old events and altered duplicates of the same cast cannot refresh an effect", () => {
  const s = selected(shock),
    e = { ...event(s), effectId: "cast-c-Q-10" };
  const out: unknown[] = [];
  processAugmentEvents(s, [e, { ...e, delta: -15 }], (x) => out.push(x));
  expect(out).toHaveLength(1);
  const expiry = s.augmentEffects[0]!.expiresAt;
  s.tick++;
  processAugmentEvents(s, [e], (x) => out.push(x));
  expect(out).toHaveLength(1);
  expect(s.augmentEffects[0]!.expiresAt).toBe(expiry);
});
it("same-tick real damage wounds the W source and prevents any new protected targets", () => {
  const s = selected(discipline);
  s.commanders.find((c) => c.id === "c")!.hpMilli = 1;
  squad(s, "b").position = { x: 500, y: 0 };
  const r = step(s, [
    ...experimentalFrames(discipline, 2)[1]!,
    {
      playerId: "enemy",
      command: {
        type: "ATTACK",
        squadIds: ["b"],
        targetSquadId: "a",
        seq: 1,
        requestedTick: 1,
      },
    },
  ]);
  expect(r.events.some((e) => e.type === "SKILL_CAST" && e.skill === "W")).toBe(
    true,
  );
  expect(
    r.events.some((e) => e.type === "COMMANDER_WOUNDED" && e.actorId === "c"),
  ).toBe(true);
  expect(r.state.augmentEffects).toEqual([]);
});
