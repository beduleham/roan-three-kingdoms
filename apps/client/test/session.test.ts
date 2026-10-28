import { expect, it } from "vitest";
import {
  parseBattleConfig,
  replay,
  hashReplayValue,
  livingSoldiers,
} from "../../../packages/battle-core/src/index.js";
import raw from "../../../battle_config.v1.json";
import { LocalSession, defaults, DEMO, HUMAN } from "../src/session.js";
const config = parseBattleConfig(raw);
const start = () => new LocalSession(config);
function tick(s: LocalSession) {
  s.paused = false;
  s.advance(100);
}
it("starts with two squads/40 soldiers per player, explicit R-test level and no augmentation", () => {
  const s = start();
  for (const id of [HUMAN, "enemy"]) {
    expect(
      s.state.squads
        .filter((s) => s.ownerPlayerId === id)
        .reduce((n, s) => n + livingSoldiers(s, config), 0),
    ).toBe(40);
  }
  expect(s.state.players.every((p) => p.level === DEMO.startLevel)).toBe(true);
  expect(s.state.augmentDefinitions).toEqual([]);
});
it("all four unit types are scenario choices without modifying core configuration", () => {
  const s = new LocalSession(config, {
    human: ["infantry", "spears"],
    enemy: ["archers", "cavalry"],
    experimental: false,
  });
  expect(new Set(s.state.squads.map((s) => s.unitType)).size).toBe(4);
  expect(s.config).toEqual(config);
});
it("binds local identity and rejects enemy squad/commander controls", () => {
  const s = start();
  expect(s.select("enemy-1")).toBe(false);
  expect(
    s.send({
      type: "MOVE",
      squadIds: ["enemy-1"],
      destination: { x: 1, y: 1 },
    }),
  ).toBe(false);
  expect(
    s.send({
      type: "CAST_SKILL",
      skill: "W",
      commanderId: "enemy-commander",
      squadIds: ["human-1"],
    }),
  ).toBe(false);
  s.rightClick({ x: 7000, y: 4000 });
  tick(s);
  expect(s.frames[0]![0]!.playerId).toBe(HUMAN);
  expect(s.frames[0]![0]!.command.seq).toBe(0);
});
it("deduplicates same-tick gestures but allows a new command after a tick", () => {
  const s = start();
  const cmd = {
    type: "MOVE" as const,
    squadIds: ["human-1"],
    destination: { x: 7000, y: 4000 },
  };
  expect(s.send(cmd)).toBe(true);
  expect(s.send(cmd)).toBe(false);
  tick(s);
  expect(s.frames[0]).toHaveLength(1);
  expect(s.send(cmd)).toBe(true);
  tick(s);
  expect(s.frames[1]![0]!.command.seq).toBe(1);
});
it("skill targeting does not cast until confirmed and cannot leak to a new selection", () => {
  const s = start();
  s.beginSkill("Q");
  s.target("enemy-1");
  tick(s);
  expect(s.frames[0]).toEqual([]);
  s.select("human-2");
  s.confirmSkill();
  tick(s);
  expect(s.frames[1]).toEqual([]);
  s.beginSkill("Q");
  s.target("enemy-2");
  s.confirmSkill();
  tick(s);
  const cmd = s.frames[2]![0]!.command;
  expect(cmd.type).toBe("CAST_SKILL");
  expect(cmd.squadIds).toEqual(["human-2"]);
});
it("W/R require explicit targets and Q rejects friendly targets in the adapter", () => {
  const s = start();
  s.beginSkill("W");
  s.confirmSkill();
  tick(s);
  expect(s.frames[0]).toEqual([]);
  s.target("enemy-1");
  expect(s.pending!.squadIds).toEqual([]);
  s.target("human-1");
  s.target("human-2");
  s.confirmSkill();
  tick(s);
  expect(s.frames[1]![0]!.command.squadIds).toEqual(["human-1", "human-2"]);
  s.beginSkill("Q");
  s.target("human-2");
  expect(s.pending!.targetSquadId).toBeUndefined();
});
it("right click while targeting cancels without issuing an accidental move", () => {
  const s = start();
  s.beginSkill("Q");
  s.rightClick({ x: 5000, y: 5000 });
  tick(s);
  expect(s.frames[0]).toEqual([]);
  expect(s.pending).toBeNull();
});
it("reset discards pending commands, partial clock, targeting, logs and sequence", () => {
  const s = start();
  s.send({
    type: "MOVE",
    squadIds: ["human-1"],
    destination: { x: 9000, y: 9000 },
  });
  s.beginSkill("W");
  s.paused = false;
  s.advance(50);
  s.reset();
  expect(s.paused).toBe(true);
  expect(s.pending).toBeNull();
  expect(s.frames).toEqual([]);
  expect(s.events).toEqual([]);
  expect(s.state.tick).toBe(0);
  s.paused = false;
  s.advance(50);
  expect(s.state.tick).toBe(0);
  s.advance(50);
  expect(s.frames[0]).toEqual([]);
  s.rightClick({ x: 7000, y: 4000 });
  s.advance(100);
  expect(s.frames[1]![0]!.command.seq).toBe(0);
});
it("render delta accumulator retains fixed ticks, pause freezes and neither catchup nor AI generates tactical commands", () => {
  const s = start();
  s.advance(1000);
  expect(s.state.tick).toBe(0);
  s.togglePause();
  s.advance(25);
  s.advance(75);
  expect(s.state.tick).toBe(1);
  s.advance(1500);
  expect(s.state.tick).toBe(11);
  s.advance(0);
  expect(s.state.tick).toBe(16);
  expect(s.frames.flat()).toEqual([]);
  expect(s.state.skillEffects).toEqual([]);
});
it("experimental offer comes from core and preserves remaining opportunities on shortage", () => {
  const s = new LocalSession(config, { ...defaults, experimental: true });
  const p = s.state.augmentProgress.find((p) => p.playerId === HUMAN)!;
  expect(p.offer!.candidates).toHaveLength(3);
  expect(s.state.augmentEffects).toEqual([]);
  s.send({
    type: "SELECT_AUGMENT",
    squadIds: [],
    checkpoint: p.offer!.checkpoint,
    augmentId: p.offer!.candidates[0]!,
  });
  tick(s);
  const next = s.state.augmentProgress.find((p) => p.playerId === HUMAN)!;
  expect(next.spent).toBe(1);
  expect(next.earned.length - next.spent).toBe(2);
  expect(next.offer).toBeNull();
});
it("core retains authority for invalid R targets and returns rejection for HUD", () => {
  const s = new LocalSession(config, {
    ...defaults,
    human: ["archers", "spears"],
  });
  s.beginSkill("R");
  s.target("human-1");
  s.confirmSkill();
  tick(s);
  expect(s.notice).toContain("MELEE_REQUIRED");
});
it(
  "90-second UI session state and events equal direct headless replay",
  { timeout: 15000 },
  () => {
    const s = start();
    s.paused = false;
    s.beginSkill("W");
    s.target("human-1");
    s.confirmSkill();
    s.advance(100);
    s.beginSkill("R");
    s.target("human-1");
    s.confirmSkill();
    s.advance(100);
    s.beginSkill("Q");
    s.target("enemy-1");
    s.confirmSkill();
    while (s.state.tick < 900) s.advance(100);
    const r = replay(s.initial, s.frames);
    expect(hashReplayValue(s.state)).toBe(r.stateHash);
    expect(hashReplayValue(s.events)).toBe(r.eventHash);
    expect(s.frames.flat().every((i) => i.playerId === HUMAN)).toBe(true);
    expect(s.events.some((e) => e.type === "CHARGE_IMPACT")).toBe(true);
  },
);

it("normalizes multi-target order when rejecting same-tick duplicate commands", () => {
  const s = start();
  const intent = {
    type: "CAST_SKILL" as const,
    skill: "W" as const,
    commanderId: "human-commander",
    squadIds: ["human-2", "human-1"],
  };
  expect(s.send(intent)).toBe(true);
  expect(s.send({ ...intent, squadIds: ["human-1", "human-2"] })).toBe(false);
  tick(s);
  expect(s.frames[0]).toHaveLength(1);
});

import { createBattle } from "../../../packages/battle-core/src/index.js";
import { scenario } from "../src/session.js";
it("stops after a complete simultaneous elimination tick and preserves replay", () => {
  const s = start();
  const fixture = scenario(config, defaults);
  fixture.squads = fixture.squads!.map((s) => ({
    ...s,
    position: { x: 6000, y: 4000 },
    hpMilli: 1,
  }));
  s.initial = createBattle(config, DEMO.seed, fixture);
  s.state = s.initial;
  s.paused = false;
  s.advance(1000);
  expect(s.result?.outcome).toBe("mutual-elimination");
  expect(s.paused).toBe(true);
  expect(s.state.tick).toBeLessThan(10);
  expect(s.frames).toHaveLength(s.state.tick);
  const tick = s.state.tick;
  const before = s.exportLog();
  s.togglePause();
  s.paused = false; // Even a caller toggling the public pause flag cannot advance an ended test.
  s.advance(1000);
  expect(s.state.tick).toBe(tick);
  expect(
    s.send({
      type: "MOVE",
      squadIds: ["human-1"],
      destination: { x: 0, y: 0 },
    }),
  ).toBe(false);
  s.beginSkill("W");
  expect(s.pending).toBeNull();
  const result = replay(before.initial, before.frames);
  expect(result.stateHash).toBe(before.stateHash);
  expect(result.eventHash).toBe(before.eventHash);
  s.reset();
  expect(s.result).toBeNull();
  expect(s.state.tick).toBe(0);
  expect(s.paused).toBe(true);
  expect(s.frames).toEqual([]);
  expect(
    s.send({
      type: "MOVE",
      squadIds: ["human-1"],
      destination: { x: 0, y: 0 },
    }),
  ).toBe(true);
});

it("observes an enemy without changing ownership, selection, pending targeting, or replay", () => {
  const s = start();
  s.beginSkill("Q");
  s.target("enemy-1");
  const pending = structuredClone(s.pending),
    selected = [...s.selected],
    before = s.exportLog();
  expect(s.inspectEnemy("enemy-2")).toBe(true);
  expect(s.inspectedEnemyId).toBe("enemy-2");
  expect(s.selected).toEqual(selected);
  expect(s.pending).toEqual(pending);
  expect(s.exportLog()).toEqual(before);
  tick(s);
  expect(s.frames[0]).toEqual([]);
  expect(s.inspectEnemy("human-1")).toBe(false);
  expect(s.inspectEnemy("missing")).toBe(false);
  expect(s.inspectedEnemyId).toBe("enemy-2");
  expect(s.select("enemy-2")).toBe(false);
  s.inspectEnemy(null);
  expect(s.inspectedEnemyId).toBeNull();
});
it("keeps defeated enemies inspectable and clears observation on retry", () => {
  const s = start();
  s.state = structuredClone(s.state);
  s.state.squads.find((s) => s.id === "enemy-1")!.hpMilli = 0;
  expect(s.inspectEnemy("enemy-1")).toBe(true);
  s.reset();
  expect(s.inspectedEnemyId).toBeNull();
});

it("starts an explicit all-friendly advance using ordinary replayable orders without automatic skills", () => {
  const s = start(),
    before = hashReplayValue(s.state);
  s.inspectEnemy("enemy-1");
  expect(s.canStartEngagement).toBe(true);
  expect(s.startEngagement()).toBe(true);
  expect(s.paused).toBe(false);
  expect(s.selected).toEqual(["human-1", "human-2"]);
  expect(hashReplayValue(s.state)).toBe(before);
  s.advance(100);
  expect(s.frames[0]!.map((i) => i.command.type)).toEqual([
    "SET_STANCE",
    "ATTACK_MOVE",
  ]);
  expect(
    s.frames[0]!.every(
      (i) =>
        i.playerId === HUMAN &&
        i.command.squadIds.join(",") === "human-1,human-2",
    ),
  ).toBe(true);
  expect(s.frames[0]![1]!.command).toMatchObject({
    type: "ATTACK_MOVE",
    destination: { x: 14000, y: 6500 },
  });
  expect(
    s.state.squads
      .filter((s) => s.ownerPlayerId === HUMAN)
      .every((s) => s.stance === "aggressive"),
  ).toBe(true);
  expect(s.events.some((e) => e.type === "SKILL_CAST")).toBe(false);
  const log = s.exportLog(),
    replayed = replay(log.initial, log.frames);
  expect(replayed.stateHash).toBe(log.stateHash);
  expect(replayed.eventHash).toBe(log.eventHash);
});
it("does not repeat the shortcut during a running or paused battle, and resets its availability", () => {
  const s = start();
  s.startEngagement();
  expect(s.startEngagement()).toBe(false);
  s.advance(100);
  s.togglePause();
  expect(s.canStartEngagement).toBe(false);
  expect(s.startEngagement()).toBe(false);
  expect(s.frames.flat()).toHaveLength(2);
  s.reset();
  expect(s.canStartEngagement).toBe(true);
});
it("preserves pending skill targets and queued manual commands instead of overwriting them", () => {
  const s = start();
  s.beginSkill("Q");
  s.target("enemy-1");
  const pending = structuredClone(s.pending);
  expect(s.startEngagement()).toBe(false);
  expect(s.pending).toEqual(pending);
  expect(s.paused).toBe(true);
  s.cancel();
  expect(s.canStartEngagement).toBe(true);
  s.rightClick({ x: 7000, y: 4000 });
  expect(s.startEngagement()).toBe(false);
  tick(s);
  expect(s.frames[0]!.map((i) => i.command.type)).toEqual(["MOVE"]);
});
it("does not replace an unconfirmed tactical mode", () => {
  const s = start();
  s.mode = "RETREAT";
  expect(s.startEngagement()).toBe(false);
  expect(s.mode).toBe("RETREAT");
  s.cancel();
  expect(s.canStartEngagement).toBe(true);
});
