import { describe, it, expect } from "vitest";
import raw from "../../../national_demo.v1.json";
import { AuthoritativeMatch, initialNationalBattle } from "../src/match.js";
import {
  nationalRulesSchema,
  advanceNational,
  queueSupply,
  cancelNationalSupply,
} from "../../../packages/battle-core/dist/index.js";
import { splitCommanderDamage } from "../../../packages/battle-core/dist/warrior.js";
import {
  auditNationalEconomy,
  auditAugmentCatalog,
} from "../src/national-audit.js";
const rules = nationalRulesSchema.parse(raw);
function fixture() {
  const m = new AuthoritativeMatch("national");
  return {
    m,
    b: m.state,
    n: m.national!,
    o: m.objectiveMatch!,
    p: m.state.players[0]!,
    s: m.state.squads[0]!,
  };
}
function at(
  f: ReturnType<typeof fixture>,
  tick: number,
  events: any[] = [],
  before: Record<string, number> = {},
) {
  f.b.tick = tick;
  f.o.tick = tick;
  f.n.processedTick = tick - 1;
  return advanceNational(
    f.b,
    f.n,
    f.o,
    rules,
    events,
    Object.fromEntries(f.o.points.map((p) => [p.id, p.owner])),
    before,
  );
}
describe("Phase7 rule baseline v1", () => {
  it("home idling grants only supply, and retaining original squads can reach every rank cap", () => {
    const f = fixture();
    at(f, 50);
    expect(f.p).toMatchObject({ xp: 0, merit: 0, supplyPoints: 52, level: 1 });
    const a = auditNationalEconomy(initialNationalBattle(rules), rules);
    expect(a.ranks.every((r) => r.gap === 0)).toBe(true);
    expect(a.idle[0]).toMatchObject({ xp: 0, merit: 0, level: 1, supply: 410 });
  });
  it("promotion adds capacity without granting HP and paid refill reaches exactly2/50", () => {
    const f = fixture();
    f.p.merit = 1200;
    at(f, 1);
    expect(f.p.rank).toBe("sima");
    expect(f.s.maxSoldiers).toBe(25);
    expect(f.s.hpMilli).toBe(2000000);
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      }),
    ).toBe("SUPPLY_STARTED");
    at(f, 31);
    expect(f.s.hpMilli).toBe(2500000);
    const other = f.b.squads.find((s) => s.id === "blue-1-2")!;
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [other.id],
      }),
    ).toBe("SUPPLY_STARTED");
    at(f, 61);
    expect(other.hpMilli).toBe(2500000);
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [other.id],
      }),
    ).toBe("NO_CAPACITY");
  });
  it("allows paid wiped recovery without resurrecting defeated squads", () => {
    const f = fixture();
    f.b.squads
      .filter((s) => s.ownerPlayerId === f.p.id)
      .forEach((s) => {
        s.hpMilli = 0;
        s.fsmState = "DEFEATED";
      });
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RECRUIT",
        unitType: "infantry",
        squadIds: [],
      }),
    ).toBe("SUPPLY_STARTED");
    expect(f.p.supplyPoints).toBe(10);
    at(f, 30);
    const troop = f.b.squads.at(-1)!;
    expect(troop.id).toContain("recruit");
    expect(troop.hpMilli).toBe(1000000);
    expect(troop.maxSoldiers).toBe(20);
    expect(f.s.hpMilli).toBe(0);
  });
  it("allows repeated manual paid recovery only after real supply income, with fresh IDs each time", () => {
    const f = fixture();
    const wipe = () =>
      f.b.squads
        .filter((s) => s.ownerPlayerId === f.p.id)
        .forEach((s) => {
          s.hpMilli = 0;
          s.fsmState = "DEFEATED";
        });
    const recruit = () =>
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RECRUIT",
        unitType: "spears",
        squadIds: [],
      });
    wipe();
    expect(recruit()).toBe("SUPPLY_STARTED");
    at(f, 30);
    const firstId = f.b.squads.at(-1)!.id;
    wipe();
    expect(recruit()).toBe("INSUFFICIENT_SUPPLY");
    for (let tick = 50; tick <= 750; tick += 50) at(f, tick);
    expect(f.p.supplyPoints).toBe(40);
    expect(f.p.level).toBe(1);
    expect(recruit()).toBe("SUPPLY_STARTED");
    at(f, 780);
    const second = f.b.squads.at(-1)!;
    expect(second.id).not.toBe(firstId);
    expect(second.hpMilli).toBe(1000000);
    expect(f.b.squads.find((s) => s.id === firstId)!.hpMilli).toBe(0);
    expect(f.p.supplyPoints).toBe(0);
    expect(f.n.jobs).toHaveLength(0);
  });
  it.each(["lost", "contested", "capturing"])(
    "refunds wiped recovery when home is %s",
    (reason) => {
      const f = fixture();
      f.b.squads
        .filter((s) => s.ownerPlayerId === f.p.id)
        .forEach((s) => (s.hpMilli = 0));
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RECRUIT",
        unitType: "spears",
        squadIds: [],
      });
      const base = f.o.points.find((p) => p.id === rules.bases.blue)!;
      if (reason === "lost") base.owner = "red";
      else if (reason === "contested") base.contested = true;
      else base.capturing = "red";
      at(f, 30);
      expect(f.p.supplyPoints).toBe(50);
      expect(f.n.jobs).toHaveLength(0);
      expect(f.n.stats[f.p.id]!.feedback).toBe("SUPPLY_CANCELLED");
    },
  );
  it("rejects remote recruitment for surviving armies and rejects dead refill targets", () => {
    const f = fixture();
    f.b.squads
      .filter((s) => s.ownerPlayerId === f.p.id)
      .forEach((s) => (s.position = { x: 12000, y: 7000 }));
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RECRUIT",
        unitType: "archers",
        squadIds: [],
      }),
    ).toBe("NOT_OWNER");
    f.s.hpMilli = 0;
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      }),
    ).toBe("FORCED_STATE");
  });
  it("allocates simultaneous overkill proportionally and deduplicates core attack identities", () => {
    const run = (reverse = false) => {
      const f = fixture(),
        target = f.b.squads.find((s) => s.id === "green-1-1")!,
        before = target.hpMilli;
      target.hpMilli -= 90000;
      const events = [
        {
          type: "ATTACK_HIT",
          tick: 0,
          actorId: "blue-1-1",
          targetId: target.id,
          delta: -200000,
        },
        {
          type: "ATTACK_HIT",
          tick: 0,
          actorId: "red-1-1",
          targetId: target.id,
          delta: -100000,
        },
      ];
      at(f, 1, reverse ? events.reverse() : [...events, events[0]!], {
        [target.id]: before,
      });
      return [f.n.stats["blue-1"]!.damage, f.n.stats["red-1"]!.damage];
    };
    expect(run()).toEqual([60000, 30000]);
    expect(run(true)).toEqual(run());
  });
  it("ignores stale and friendly damage and rejects repeated whole ticks", () => {
    const f = fixture(),
      target = f.b.squads.find((s) => s.id === "blue-1-2")!,
      before = target.hpMilli;
    target.hpMilli -= 90000;
    at(
      f,
      1,
      [
        {
          type: "ATTACK_HIT",
          tick: 0,
          actorId: f.s.id,
          targetId: target.id,
          delta: -90000,
        },
        {
          type: "ATTACK_HIT",
          tick: -1,
          actorId: "red-1-1",
          targetId: target.id,
          delta: -90000,
        },
      ],
      { [target.id]: before },
    );
    expect(f.n.stats["red-1"]!.damage).toBe(0);
    expect(f.n.stats[f.p.id]!.damage).toBe(0);
    expect(() => advanceNational(f.b, f.n, f.o, rules, [], {}, {})).toThrow(
      "consecutive",
    );
  });
  it("rewards actual contested field defense once per player and point", () => {
    const f = fixture(),
      point = f.o.points.find((p) => p.id === "outer-west")!;
    point.owner = "blue";
    point.open = true;
    point.contested = true;
    f.b.squads
      .filter((s) => s.ownerPlayerId === f.p.id || s.id === "red-1-1")
      .forEach((s) => (s.position = { ...point.position }));
    at(f, 50);
    expect(f.p.xp).toBe(rules.holdXp);
    expect(f.p.merit).toBe(rules.holdMerit);
  });
  it("has nine distinct definitions and seeded legal offers with seven choices and R gating", () => {
    const f = fixture();
    expect(auditAugmentCatalog(f.b)).toMatchObject({
      ids: 9,
      uniqueMechanics: 9,
    });
    const offers = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const m = new AuthoritativeMatch("national", undefined, rules, seed);
      for (let i = 0; i < 3; i++) m.join(String(i));
      m.start("0");
      m.state.players[0]!.xp = rules.xpThresholds[4]!;
      m.advance();
      const offer = m.state.augmentProgress[0]!.offer!;
      offers.add(offer.candidates.join());
      expect(offer.candidates.every((id) => !id.startsWith("p7-r-"))).toBe(
        true,
      );
    }
    expect(offers.size).toBeGreaterThan(1);
    const m = f.m;
    for (let i = 0; i < 3; i++) m.join(String(i));
    m.start("0");
    m.state.players[0]!.xp = rules.xpThresholds[39]!;
    m.advance();
    for (let i = 0; i < 7; i++) {
      const offer = m.state.augmentProgress[0]!.offer!;
      expect(offer.candidates).toHaveLength(3);
      m.submit("0", {
        type: "SELECT_AUGMENT",
        squadIds: [],
        checkpoint: offer.checkpoint,
        augmentId: offer.candidates[0],
      });
      m.advance();
    }
    expect(m.state.augmentProgress[0]!.selected).toHaveLength(7);
  });
  it("preserves the existing basic AI macro targets rather than adopting rejected routing", () => {
    const f = fixture();
    expect(f.m.nationalAICommand("blue-1")!.destination).toEqual(
      rules.objectives.points.find((p) => p.id === "outer-west")!.position,
    );
    expect(f.m.nationalAICommand("red-3")!.destination).toEqual(
      rules.objectives.points.find((p) => p.id === "capital")!.position,
    );
  });
  it("calibrates distinct reference contributions rather than passively leveling everyone", () => {
    const level = (xp: number) =>
      rules.xpThresholds.filter((v) => v <= xp).length;
    expect([3520, 3780, 4120].map(level)).toEqual([33, 34, 35]);
    expect([4800, 5600].map(level)).toEqual([38, 40]);
    expect(level(0)).toBe(1);
  });
  it("uses expanded capacity in actual commander protection boundary calculations", () => {
    const f = fixture();
    f.s.maxSoldiers = 25;
    f.s.hpMilli = 1000000;
    const deltas = new Map([[f.s.id, { hp: 100000n, morale: 0, cohesion: 0 }]]),
      c = f.b.commanders.find((c) => c.ownerPlayerId === f.p.id)!;
    expect(splitCommanderDamage(f.b, deltas).get(c.id)).toBe(
      (100000 * f.b.config.warriorAssumptions.protectedDamageShareBp) / 10000,
    );
    f.s.hpMilli = 900000;
    deltas.get(f.s.id)!.hp = 100000n;
    expect(splitCommanderDamage(f.b, deltas).get(c.id)).toBe(
      (100000 * f.b.config.warriorAssumptions.weakenedDamageShareBp) / 10000,
    );
  });
  it("refunds unfinished recovery exactly once when the match finishes", () => {
    const f = fixture();
    f.b.squads
      .filter((s) => s.ownerPlayerId === f.p.id)
      .forEach((s) => (s.hpMilli = 0));
    queueSupply(f.b, f.n, f.o, rules, f.p.id, {
      type: "RECRUIT",
      unitType: "spears",
      squadIds: [],
    });
    f.o.scores.blue = 100;
    f.b.tick = 1;
    f.o.tick = 1;
    expect(
      advanceNational(
        f.b,
        f.n,
        f.o,
        { ...rules, checkpoints: [1, 2, 3] },
        [],
        Object.fromEntries(f.o.points.map((p) => [p.id, p.owner])),
        {},
      ).result,
    ).not.toBeNull();
    expect(f.p.supplyPoints).toBe(50);
    cancelNationalSupply(f.b, f.n);
    expect(f.p.supplyPoints).toBe(50);
  });
  it("replays a defender contribution ledger through the live reward function to level33", () => {
    const f = fixture(),
      point = f.o.points.find((p) => p.id === "outer-west")!;
    point.open = true;
    point.owner = "blue";
    f.b.squads
      .filter((s) => s.ownerPlayerId === f.p.id)
      .forEach((s) => (s.position = { ...point.position }));
    f.b.tick = 1201;
    f.o.tick = 1201;
    f.n.processedTick = 1200;
    advanceNational(
      f.b,
      f.n,
      f.o,
      rules,
      [],
      {
        ...Object.fromEntries(f.o.points.map((p) => [p.id, p.owner])),
        [point.id]: null,
      },
      {},
    );
    for (const [tick, id, damage] of [
      [1202, "red-1-1", 2000000],
      [1203, "red-2-1", 1000000],
    ] as const) {
      const target = f.b.squads.find((s) => s.id === id)!,
        before = target.hpMilli;
      target.hpMilli -= damage;
      at(
        f,
        tick,
        [
          {
            type: "ATTACK_HIT",
            tick: tick - 1,
            actorId: f.s.id,
            targetId: target.id,
            delta: -damage,
          },
        ],
        { [target.id]: before },
      );
    }
    for (let tick = 1250; tick <= 9000; tick += 50) at(f, tick);
    expect(f.p.xp).toBe(3520);
    expect(f.p.level).toBe(33);
    expect(f.n.stats[f.p.id]!.damage).toBe(3000000);
  });
});
