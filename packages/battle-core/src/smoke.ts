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
      ownerPlayerId: "p1",
      nationId: "n1",
      unitType: "infantry",
      maxSoldiers: 20,
      hpMilli: 2000000,
    },
    {
      id: "b",
      ownerPlayerId: "p2",
      nationId: "n2",
      unitType: "infantry",
      maxSoldiers: 20,
      hpMilli: 2000000,
    },
  ],
  contacts: [
    { attackerId: "a", targetId: "b" },
    { attackerId: "b", targetId: "a" },
  ],
});
const frames: BattleInput[][] = Array.from({ length: 1000 }, (_, tick) => [
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
]);
const first = replay(initial, frames);
const second = replay(
  initial,
  frames.map((frame) => [...frame].reverse()),
);
if (
  first.stateHash !== second.stateHash ||
  first.eventHash !== second.eventHash ||
  first.state.tick !== 1000 ||
  !first.events.some((e) => e.type === "ATTACK_HIT" && e.delta === -6720)
)
  throw new Error("Battle smoke replay failed");
console.log(
  JSON.stringify({
    phase: 1,
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
    scope: "headless fixed-contact scenario; not a game balance validation",
  }),
);
