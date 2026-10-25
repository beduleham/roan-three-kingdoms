import { loadBattleConfig } from "./node.js";
import { createBattle, replay } from "./index.js";
import type { BattleInput } from "./model.js";
const config = loadBattleConfig(
  new URL("../../../battle_config.v1.json", import.meta.url),
);
const initial = createBattle(config, 42, {
  players: [
    { id: "p1", nationId: "n1" },
    { id: "p2", nationId: "n2" },
  ],
  squads: [
    {
      id: "a",
      position: { x: 0, y: 0 },
      facing: { x: 1, y: 0 },
      ownerPlayerId: "p1",
      nationId: "n1",
      unitType: "infantry",
      maxSoldiers: 20,
      hpMilli: 2000000,
    },
    {
      id: "b",
      position: { x: 4000, y: 0 },
      facing: { x: -1, y: 0 },
      ownerPlayerId: "p2",
      nationId: "n2",
      unitType: "infantry",
      maxSoldiers: 20,
      hpMilli: 2000000,
    },
  ],
});
const frames: BattleInput[][] = Array.from({ length: 1000 }, (_, tick) =>
  tick === 0
    ? [
        {
          playerId: "p1",
          command: {
            type: "ATTACK",
            seq: tick,
            requestedTick: tick,
            squadIds: ["a"],
            targetSquadId: "b",
          },
        },
        {
          playerId: "p2",
          command: {
            type: "ATTACK",
            seq: tick,
            requestedTick: tick,
            squadIds: ["b"],
            targetSquadId: "a",
          },
        },
      ]
    : [],
);
const first = replay(initial, frames);
const second = replay(
  initial,
  frames.map((frame) => [...frame].reverse()),
);
if (
  first.stateHash !== second.stateHash ||
  first.eventHash !== second.eventHash ||
  first.state.tick !== 1000 ||
  first.events.filter((e) => e.type === "ORDER_ACCEPTED").length !== 2 ||
  !first.events.some((e) => e.type === "FSM_CHANGED" && e.reason === "CHASE") ||
  !first.events.some((e) => e.type === "ATTACK_HIT" && e.delta === -6720)
)
  throw new Error("Battle smoke replay failed");
console.log(
  JSON.stringify({
    phase: 2,
    ticks: first.state.tick,
    stateHash: first.stateHash,
    eventHash: first.eventHash,
    replayMatches: true,
    events: first.events.length,
    squads: first.state.squads.map((s) => ({
      id: s.id,
      hpMilli: s.hpMilli,
      status: s.fsmState,
    })),
    scope:
      "headless spatial persistent-order scenario; not a game balance validation",
  }),
);

// Separate warrior scenario: the existing spatial smoke remains a regression check.
const warriorInitial = createBattle(config, 42, {
  players: [
    { id: "warrior-player", nationId: "allies", level: 15 },
    { id: "enemy-player", nationId: "enemies" },
  ],
  squads: [
    {
      id: "host",
      ownerPlayerId: "warrior-player",
      nationId: "allies",
      unitType: "cavalry",
      maxSoldiers: 20,
      hpMilli: 2000000,
      stance: "defensive",
      position: { x: 0, y: 0 },
    },
    {
      id: "enemy",
      ownerPlayerId: "enemy-player",
      nationId: "enemies",
      unitType: "infantry",
      maxSoldiers: 20,
      hpMilli: 2000000,
      morale: 9,
      stance: "defensive",
      position: { x: 5000, y: 0 },
      facing: { x: -1, y: 0 },
    },
  ],
  commanders: [
    {
      id: "warrior",
      ownerPlayerId: "warrior-player",
      assignedSquadId: "host",
      hpMilli: 450000,
      maxHpMilli: 450000,
      respawnZoneIndex: 0,
    },
  ],
  safeZones: [
    { nationId: "allies", position: { x: -5000, y: 0 }, radiusUnits: 100 },
  ],
});
const skillInputs: BattleInput[][] = Array.from({ length: 1000 }, (_, tick) =>
  tick === 0
    ? [
        {
          playerId: "warrior-player",
          command: {
            type: "CAST_SKILL",
            commanderId: "warrior",
            skill: "R",
            squadIds: ["host"],
            seq: 0,
            requestedTick: 0,
          },
        },
        {
          playerId: "warrior-player",
          command: {
            type: "CAST_SKILL",
            commanderId: "warrior",
            skill: "W",
            squadIds: ["host"],
            seq: 1,
            requestedTick: 0,
          },
        },
        {
          playerId: "warrior-player",
          command: {
            type: "CAST_SKILL",
            commanderId: "warrior",
            skill: "Q",
            squadIds: ["host"],
            targetSquadId: "enemy",
            seq: 2,
            requestedTick: 0,
          },
        },
      ]
    : [],
);
const warriorRun = replay(warriorInitial, skillInputs);
const warriorRepeat = replay(
  warriorInitial,
  skillInputs.map((frame) => [...frame].reverse()),
);
if (
  warriorRun.stateHash !== warriorRepeat.stateHash ||
  warriorRun.eventHash !== warriorRepeat.eventHash ||
  warriorRun.events.filter((e) => e.type === "CHARGE_IMPACT").length !== 1 ||
  warriorRun.events.filter((e) => e.type === "SKILL_EFFECT_EXTENDED").length !==
    1 ||
  warriorRun.state.skillEffects.length !== 0
)
  throw new Error("Warrior skill smoke failed");
console.log(
  JSON.stringify({
    phase: "3-warrior-subset",
    ticks: warriorRun.state.tick,
    stateHash: warriorRun.stateHash,
    eventHash: warriorRun.eventHash,
    replayMatches: true,
    skillCasts: warriorRun.events.filter((e) => e.type === "SKILL_CAST").length,
    chargeImpacts: warriorRun.events.filter((e) => e.type === "CHARGE_IMPACT")
      .length,
    routExtensions: warriorRun.events.filter(
      (e) => e.type === "SKILL_EFFECT_EXTENDED",
    ).length,
    scope: "provisional warrior rules; augments excluded; Phase 3 incomplete",
  }),
);
