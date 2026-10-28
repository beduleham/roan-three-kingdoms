import { expect, it } from "vitest";
import { orderCues } from "../src/order-view.js";
const squad = (id = "a", nationId = "blue") => ({
  id,
  nationId,
  position: { x: 100, y: 200 },
  anchor: { x: 0, y: 0 },
  hpMilli: 100,
  fsmState: "IDLE" as const,
  currentTargetId: null as string | null,
  charge: null,
  order: null,
});
it("shows an accepted move destination and does not mutate or alias it", () => {
  const s = {
    ...squad(),
    order: { type: "MOVE" as const, seq: 1, destination: { x: 500, y: 800 } },
  };
  const before = structuredClone(s);
  const cues = orderCues(s, [s]);
  expect(cues[0]).toMatchObject({ kind: "move", to: s.order.destination });
  cues[0]!.to.x = 999;
  expect(s).toEqual(before);
});
it("separates actual engagement from an attack-move destination", () => {
  const enemy = squad("b", "red");
  const s = {
    ...squad(),
    fsmState: "ENGAGE" as const,
    currentTargetId: "b",
    order: {
      type: "ATTACK_MOVE" as const,
      seq: 1,
      destination: { x: 1000, y: 2000 },
    },
  };
  expect(orderCues(s, [s, enemy]).map((c) => c.kind)).toEqual([
    "target",
    "attack-move",
  ]);
});
it("does not duplicate an explicit target or point to a dead or friendly unit", () => {
  const enemy = squad("b", "red");
  const s = {
    ...squad(),
    currentTargetId: "b",
    order: { type: "ATTACK" as const, targetSquadId: "b", seq: 1 },
  };
  expect(orderCues(s, [s, enemy])).toHaveLength(1);
  expect(orderCues(s, [s, { ...enemy, hpMilli: 0 }])).toEqual([]);
  expect(orderCues(s, [s, { ...enemy, nationId: "blue" }])).toEqual([]);
});
it.each(["ROUTED", "BROKEN", "REGROUP"] as const)(
  "suppresses stale orders during %s",
  (fsmState) => {
    const s = {
      ...squad(),
      fsmState,
      order: { type: "RETREAT" as const, destination: { x: 0, y: 0 }, seq: 1 },
    };
    expect(orderCues(s, [s])).toEqual([]);
  },
);
it("uses the fixed charge destination and the actual return anchor", () => {
  const s = { ...squad(), charge: { destination: { x: 400, y: 600 } } };
  expect(orderCues(s, [s])[0]).toMatchObject({
    kind: "charge",
    to: { x: 400, y: 600 },
  });
  expect(orderCues({ ...squad(), fsmState: "RETURN" }, [])[0]).toMatchObject({
    kind: "return",
    to: { x: 0, y: 0 },
  });
});
it("clears defeated squads and completed orders", () => {
  expect(orderCues({ ...squad(), hpMilli: 0 }, [])).toEqual([]);
  expect(orderCues(squad(), [])).toEqual([]);
});
