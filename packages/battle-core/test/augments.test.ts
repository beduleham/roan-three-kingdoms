import { expect, it } from "vitest";
import { createBattle, step, replay } from "../src/index.js";
import type { BattleInput, BattleEvent } from "../src/model.js";
import { loadBattleConfig } from "../src/node.js";
import {
  augmentDefinitionsSchema,
  processAugmentEvents,
  augmentBonus,
} from "../src/augments.js";
import { syntheticAugments } from "./fixtures/augments.js";
const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
function setup(level = 38) {
  return createBattle(config, 1, {
    augmentDefinitions: syntheticAugments,
    players: [
      { id: "p", nationId: "n", level },
      { id: "enemy", nationId: "e" },
    ],
    squads: [
      {
        id: "a",
        ownerPlayerId: "p",
        nationId: "n",
        unitType: "cavalry",
        maxSoldiers: 20,
        hpMilli: 2000000,
        stance: "defensive",
      },
      {
        id: "b",
        ownerPlayerId: "enemy",
        nationId: "e",
        unitType: "infantry",
        maxSoldiers: 20,
        hpMilli: 2000000,
        stance: "defensive",
        position: { x: 5000, y: 0 },
      },
    ],
    commanders: [
      {
        id: "c",
        ownerPlayerId: "p",
        assignedSquadId: "a",
        hpMilli: 450000,
        maxHpMilli: 450000,
      },
    ],
  });
}
const select = (id = "test-charge", tick = 0, playerId = "p"): BattleInput => ({
  playerId,
  command: {
    type: "SELECT_AUGMENT",
    augmentId: id,
    checkpoint: 5,
    seq: tick,
    requestedTick: tick,
    squadIds: [],
  },
});
const charge = (tick = 1): BattleInput => ({
  playerId: "p",
  command: {
    type: "CAST_SKILL",
    skill: "Q",
    commanderId: "c",
    squadIds: ["a"],
    targetSquadId: "b",
    seq: tick,
    requestedTick: tick,
  },
});
it.each([
  [33, 5],
  [34, 6],
  [38, 7],
])("level %i earns %i opportunities", (level, count) => {
  expect(
    setup(level).augmentProgress.find((p) => p.playerId === "p")!.earned,
  ).toHaveLength(count);
});
it("rejects malformed definitions and duplicate IDs", () => {
  expect(() =>
    augmentDefinitionsSchema.parse([
      ...syntheticAugments,
      syntheticAugments[0],
    ]),
  ).toThrow();
  expect(() =>
    augmentDefinitionsSchema.parse([
      { ...syntheticAugments[0], durationTicks: 0 },
    ]),
  ).toThrow();
  expect(() =>
    augmentDefinitionsSchema.parse([
      { ...syntheticAugments[0], trigger: "button" },
    ]),
  ).toThrow();
});
it("operational defaults contain no synthetic content", () => {
  expect(createBattle(config, 1).augmentDefinitions).toEqual([]);
});
it("holding a choice gives no effects even on a real collision", () => {
  const result = replay(setup(), [
    [],
    [charge()],
    ...Array.from({ length: 25 }, () => []),
  ]);
  expect(result.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(true);
  expect(result.state.augmentEffects).toEqual([]);
  expect(result.state.augmentProgress[0]!.selected).toEqual([]);
});
it("requires an actual offered candidate and the authenticated player's opportunity", () => {
  expect(step(setup(), [select("invented")]).events[0]!.reason).toBe(
    "NOT_OFFERED",
  );
  expect(
    step(setup(), [select("test-charge", 0, "enemy")]).events[0]!.reason,
  ).toBe("NO_OPPORTUNITY");
  const duplicate = step(setup(), [select(), select()]);
  expect(
    duplicate.events.filter((e) => e.reason === "DUPLICATE_SEQ"),
  ).toHaveLength(2);
  expect(
    duplicate.state.augmentProgress.find((p) => p.playerId === "p")!.selected,
  ).toEqual([]);
});
it("selection consumes one chance, excludes selected content and holds on candidate shortage", () => {
  const result = step(setup(), [select()]);
  const p = result.state.augmentProgress.find((p) => p.playerId === "p")!;
  expect(p.selected).toEqual(["test-charge"]);
  expect(p.spent).toBe(1);
  expect(p.offer).toBeNull();
  expect(p.earned).toHaveLength(7);
  expect(result.state.augmentEffects).toEqual([]);
});
it("Q cast does not trigger impact augmentation, but physical impact does exactly once", () => {
  let state = step(setup(), [select()]).state;
  const cast = step(state, [charge()]);
  expect(cast.events.some((e) => e.type === "AUGMENT_EFFECT_APPLIED")).toBe(
    false,
  );
  const result = replay(
    cast.state,
    Array.from({ length: 25 }, () => []),
  );
  expect(result.events.filter((e) => e.type === "CHARGE_IMPACT")).toHaveLength(
    1,
  );
  expect(
    result.events.filter((e) => e.type === "AUGMENT_EFFECT_APPLIED"),
  ).toHaveLength(1);
  expect(
    result.events.filter((e) => e.type === "AUGMENT_EFFECT_EXPIRED"),
  ).toHaveLength(1);
});
it("prevents duplicate event execution and generated-event recursion; caps stacks", () => {
  const state = step(setup(), [select()]).state;
  const event: BattleEvent = {
    type: "CHARGE_IMPACT",
    actorId: "a",
    tick: state.tick,
  };
  const output: BattleEvent[] = [];
  const emit = (e: Omit<BattleEvent, "tick">) =>
    output.push({ ...e, tick: state.tick });
  processAugmentEvents(state, [event, event], emit);
  processAugmentEvents(state, [event, ...output], emit);
  expect(output).toHaveLength(1);
  expect(state.augmentEffects[0]!.stacks).toBe(1);
  state.tick++;
  processAugmentEvents(state, [{ ...event, tick: state.tick }], emit);
  expect(state.augmentEffects[0]!.stacks).toBe(2);
  expect(augmentBonus(state, state.squads[0]!, "attack")).toBe(1500);
  state.tick++;
  processAugmentEvents(state, [{ ...event, tick: state.tick }], emit);
  expect(state.augmentEffects[0]!.stacks).toBe(2);
});
it("skill trigger effects activate next tick and expire at the exact duration boundary", () => {
  let state = step(setup(), [select("test-cast")]).state;
  state = step(state, [charge()]).state;
  expect(augmentBonus(state, state.squads[0]!, "speed")).toBe(500);
  state = step(state, []).state;
  expect(augmentBonus(state, state.squads[0]!, "speed")).toBe(500);
  state = step(state, []).state;
  expect(augmentBonus(state, state.squads[0]!, "speed")).toBe(0);
  expect(
    step(state, []).events.some((e) => e.type === "AUGMENT_EFFECT_EXPIRED"),
  ).toBe(true);
});
it("break trigger supports ignore policy without extending duration", () => {
  const state = step(setup(), [select("test-break")]).state;
  const event: BattleEvent = {
    type: "SQUAD_BROKEN",
    actorId: "a",
    tick: state.tick,
  };
  processAugmentEvents(state, [event], () => {});
  const deadline = state.augmentEffects[0]!.expiresAt;
  state.tick++;
  processAugmentEvents(state, [{ ...event, tick: state.tick }], () => {});
  expect(state.augmentEffects[0]!.expiresAt).toBe(deadline);
});
it(
  "replays selections and actual charge effects for 1000 ticks deterministically",
  { timeout: 15000 },
  () => {
    const initial = setup(),
      before = structuredClone(initial);
    const frames: BattleInput[][] = Array.from({ length: 1000 }, (_, t) =>
      t === 0 ? [select()] : t === 1 ? [charge()] : [],
    );
    const a = replay(initial, frames),
      b = replay(
        initial,
        frames.map((f) => [...f].reverse()),
      );
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.eventHash).toBe(b.eventHash);
    expect(initial).toEqual(before);
    expect(a.events.some((e) => e.type === "AUGMENT_EFFECT_APPLIED")).toBe(
      true,
    );
  },
);
it("rejects future checkpoints and stale selections without consuming another opportunity", () => {
  const input = select();
  if (input.command.type !== "SELECT_AUGMENT") throw new Error("fixture");
  input.command.checkpoint = 10;
  expect(step(setup(), [input]).events[0]!.reason).toBe("NOT_OFFERED");
  const state = step(setup(), [select()]).state;
  const retry = select();
  retry.command.requestedTick = 1;
  expect(step(state, [retry]).events[0]!.reason).toBe("STALE_SEQ");
  expect(state.augmentProgress.find((p) => p.playerId === "p")!.spent).toBe(1);
});
it("filters candidates by trusted level and preserves held offers", () => {
  const state = setup(5);
  state.augmentDefinitions[0]!.minLevel = 10;
  state.augmentProgress.find((p) => p.playerId === "p")!.offer = null;
  const next = step(state, []).state;
  expect(
    next.augmentProgress.find((p) => p.playerId === "p")!.offer,
  ).toBeNull();
  const offered = setup();
  expect(step(offered, []).state.augmentProgress).toEqual(
    offered.augmentProgress,
  );
});
it("refresh resets duration without stacking and does not grant retroactive casts", () => {
  const initial = setup();
  const cast = charge(0);
  const choice = select("test-cast");
  choice.command.seq = 1;
  const result = step(initial, [choice, cast]);
  expect(result.state.augmentEffects).toEqual([]);
  const state = result.state;
  const event: BattleEvent = {
    type: "SKILL_CAST",
    actorId: "c",
    tick: state.tick,
  };
  processAugmentEvents(state, [event], () => {});
  const expiry = state.augmentEffects[0]!.expiresAt;
  state.tick++;
  processAugmentEvents(state, [{ ...event, tick: state.tick }], () => {});
  expect(state.augmentEffects[0]!.expiresAt).toBe(expiry + 1);
  expect(state.augmentEffects[0]!.stacks).toBe(1);
});
