import { createBattle, step } from "./battle.js";
import { replay } from "./replay.js";
import type { BattleConfig } from "./config.js";
import type { BattleInput, BattleScenario } from "./model.js";
import {
  experimentalAugments,
  experimentalVersion,
} from "./data/experimental-v0.1.js";
export function experimentalScenario(): BattleScenario {
  return {
    augmentDefinitions: experimentalAugments,
    players: [
      { id: "p", nationId: "n", level: 38 },
      { id: "ally", nationId: "n", level: 38 },
      { id: "enemy", nationId: "e", level: 38 },
    ],
    squads: [
      {
        id: "a",
        ownerPlayerId: "p",
        nationId: "n",
        unitType: "cavalry" as const,
        position: { x: 0, y: 0 },
      },
      {
        id: "d",
        ownerPlayerId: "ally",
        nationId: "n",
        unitType: "infantry" as const,
        position: { x: 5000, y: 5000 },
        facing: { x: -1, y: 0 },
        cohesion: 14,
      },
      {
        id: "b",
        ownerPlayerId: "enemy",
        nationId: "e",
        unitType: "infantry" as const,
        position: { x: 5000, y: 0 },
        facing: { x: -1, y: 0 },
      },
      {
        id: "e",
        ownerPlayerId: "enemy",
        nationId: "e",
        unitType: "cavalry" as const,
        position: { x: 0, y: 5000 },
      },
    ].map((s) => ({
      ...s,
      maxSoldiers: 20,
      hpMilli: 2000000,
      stance: "defensive" as const,
    })),
    commanders: [
      {
        id: "c",
        ownerPlayerId: "p",
        assignedSquadId: "a",
        hpMilli: 450000,
        maxHpMilli: 450000,
      },
      {
        id: "ce",
        ownerPlayerId: "enemy",
        assignedSquadId: "e",
        hpMilli: 450000,
        maxHpMilli: 450000,
      },
    ],
  };
}
export function experimentalFrames(
  id: string | null,
  ticks = 1000,
): BattleInput[][] {
  return Array.from({ length: ticks }, (_, t): BattleInput[] => {
    if (t === 0)
      return id
        ? [
            {
              playerId: "p",
              command: {
                type: "SELECT_AUGMENT",
                seq: 0,
                requestedTick: 0,
                squadIds: [],
                checkpoint: 5,
                augmentId: id,
              },
            },
          ]
        : [];
    if (t === 1)
      return [
        {
          playerId: "p",
          command: {
            type: "CAST_SKILL",
            skill: "W",
            commanderId: "c",
            squadIds: ["a", "d"],
            seq: 1,
            requestedTick: 1,
          },
        },
      ];
    if (t === 2)
      return [
        {
          playerId: "p",
          command: {
            type: "CAST_SKILL",
            skill: "Q",
            commanderId: "c",
            squadIds: ["a"],
            targetSquadId: "b",
            seq: 2,
            requestedTick: 2,
          },
        },
        {
          playerId: "enemy",
          command: {
            type: "CAST_SKILL",
            skill: "Q",
            commanderId: "ce",
            squadIds: ["e"],
            targetSquadId: "d",
            seq: 2,
            requestedTick: 2,
          },
        },
      ];
    if (t === 20)
      return [
        {
          playerId: "p",
          command: {
            type: "MOVE",
            squadIds: ["a"],
            destination: { x: 10000, y: -5000 },
            seq: 20,
            requestedTick: 20,
          },
        },
      ];
    return [];
  });
}
export function compareExperimentalAugments(config: BattleConfig) {
  return {
    version: experimentalVersion,
    designStatus: "experimental-not-balance-validated",
    scope:
      "Deterministic headless comparison; NOT actual play balance validation; Phase 3 incomplete",
    seed: 17,
    ticks: 1000,
    cases: [null, ...experimentalAugments.map((d) => d.id)].map((id) => {
      return compareExperimentalAugmentCase(config, id);
    }),
  };
}

/** One condition, two complete 1,000-tick runs, shared by the CLI and isolated tests. */
export function compareExperimentalAugmentCase(
  config: BattleConfig,
  id: string | null,
) {
  const initial = createBattle(config, 17, experimentalScenario());
  const frames = experimentalFrames(id);
  const result = replay(initial, frames);
  const repeat = replay(
    initial,
    frames.map((f) => [...f].reverse()),
  );
  let sample = initial;
  for (const f of frames.slice(0, 30)) sample = step(sample, f).state;
  return {
    augment: id,
    stateHash: result.stateHash,
    eventHash: result.eventHash,
    replayMatches:
      result.stateHash === repeat.stateHash &&
      result.eventHash === repeat.eventHash,
    applied: result.events.filter((e) => e.type === "AUGMENT_EFFECT_APPLIED")
      .length,
    attackDamageByA: result.events
      .filter((e) => e.type === "ATTACK_HIT" && e.actorId === "a")
      .reduce((n, e) => n - (e.delta ?? 0), 0),
    cohesionLostByD: -result.events
      .filter(
        (e) =>
          e.type === "COHESION_CHANGED" &&
          e.actorId === "d" &&
          (e.delta ?? 0) < 0,
      )
      .reduce((n, e) => n + (e.delta ?? 0), 0),
    dBroken: result.events.filter(
      (e) => e.type === "SQUAD_BROKEN" && e.actorId === "d",
    ).length,
    sampleTick: sample.tick,
    sampleSquads: sample.squads.map((s) => ({
      id: s.id,
      hpMilli: s.hpMilli,
      cohesion: s.cohesion,
      position: s.position,
    })),
  };
}
