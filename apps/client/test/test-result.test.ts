import { expect, it } from "vitest";
import { testResult as summarize } from "../src/test-result.js";
import { LocalSession } from "../src/session.js";
import { parseBattleConfig } from "../../../packages/battle-core/src/index.js";
import type { BattleEvent } from "../../../packages/battle-core/src/index.js";
import raw from "../../../battle_config.v1.json";
const config = parseBattleConfig(raw);
const initial = () => new LocalSession(config).initial;
it("does not end for rout, break, a wounded commander, or one defeated squad", () => {
  const a = initial(),
    b = structuredClone(a);
  b.squads[0]!.hpMilli = 0;
  b.squads[1]!.fsmState = "ROUTED";
  b.squads[2]!.fsmState = "BROKEN";
  b.commanders[0]!.status = "WOUNDED";
  expect(summarize(a, b, [])).toBeNull();
});
it.each(["human", "enemy", "both"])(
  "reports %s elimination with a copied summary",
  (side) => {
    const a = initial(),
      b = structuredClone(a);
    b.tick = 12;
    for (const s of b.squads)
      if (side === "both" || s.ownerPlayerId === side) s.hpMilli = 0;
    const before = structuredClone(b);
    const result = summarize(a, b, [])!;
    expect(result.outcome).toBe(
      side === "both" ? "mutual-elimination" : `${side}-eliminated`,
    );
    expect(result.elapsedMs).toBe(1200);
    expect(result.sides.every((s) => s.initialSoldiers === 40)).toBe(true);
    expect(
      result.sides
        .filter((s) => side === "both" || s.playerId === side)
        .every((s) => s.remainingSoldiers === 0 && s.defeatedSquads === 2),
    ).toBe(true);
    result.sides[0]!.skills.Q = 99;
    expect(b).toEqual(before);
  },
);
it("counts accepted casts once per cast, not target, and ignores rejected commands", () => {
  const a = initial(),
    b = structuredClone(a);
  for (const s of b.squads) if (s.ownerPlayerId === "enemy") s.hpMilli = 0;
  const events: BattleEvent[] = [
    {
      tick: 0,
      type: "SKILL_CAST",
      actorId: "human-commander",
      skill: "W",
      targetSquadIds: ["human-1", "human-2"],
    },
    {
      tick: 0,
      type: "COMMAND_REJECTED",
      actorId: "human-commander",
      skill: "W",
    },
    { tick: 1, type: "CHARGE_IMPACT", actorId: "human-1" },
    { tick: 2, type: "SKILL_CAST", actorId: "enemy-commander", skill: "Q" },
  ];
  expect(summarize(a, b, events)!.sides).toMatchObject([
    { playerId: "human", skills: { Q: 0, W: 1, R: 0 }, chargeImpacts: 1 },
    { playerId: "enemy", skills: { Q: 1, W: 0, R: 0 }, chargeImpacts: 0 },
  ]);
});
it("does not treat an absent team as elimination", () => {
  const a = initial(),
    b = structuredClone(a);
  b.squads = b.squads.filter((s) => s.ownerPlayerId === "human");
  expect(summarize(a, b, [])).toBeNull();
});
