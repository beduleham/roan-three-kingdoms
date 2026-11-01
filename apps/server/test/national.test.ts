import { describe, expect, it } from "vitest";
import rawRules from "../../../experiments/phase7/legacy-national.v1.json";
import {
  AuthoritativeMatch,
  initialNationalBattle,
  nationalSlots,
} from "../src/match.js";
import {
  nationalRulesSchema,
  createNationalProgress,
  createObjectiveMatch,
  queueSupply,
  advanceNational,
  finishNationalRanking,
} from "../../../packages/battle-core/dist/index.js";
const rules = nationalRulesSchema.parse(rawRules);
function fixture() {
  const b = initialNationalBattle(rules),
    n = createNationalProgress(b),
    o = createObjectiveMatch(rules.objectives, ["blue", "red", "green"]);
  for (const [nation, id] of Object.entries(rules.bases))
    o.points.find((p) => p.id === id)!.owner = nation;
  return { b, n, o, p: b.players[0]!, s: b.squads[0]! };
}
function advance(f: ReturnType<typeof fixture>, tick = f.b.tick + 1) {
  f.b.tick = tick;
  f.o.tick = tick;
  f.n.processedTick = tick - 1;
  return advanceNational(
    f.b,
    f.n,
    f.o,
    rules,
    [],
    Object.fromEntries(f.o.points.map((p) => [p.id, p.owner])),
    {},
  );
}
function match(count = 3) {
  const m = new AuthoritativeMatch("national", undefined, rules);
  for (let i = 0; i < count; i++) m.join(`s${i}`);
  m.start("s0");
  return m;
}
describe("national supply and progression", () => {
  it("starts with nine equal seats, seven points and no free promotion soldiers", () => {
    const m = match(9);
    expect(m.state.players).toHaveLength(9);
    expect(m.state.squads).toHaveLength(18);
    expect(m.objectiveMatch!.points).toHaveLength(7);
    expect(m.lobby.slots.every((s) => s.occupant === "human")).toBe(true);
    m.state.players[0]!.merit = 10500;
    m.advance();
    expect(m.state.players[0]!.rank).toBe("general");
    expect(m.state.squads).toHaveLength(18);
  });
  it("charges actual supply and completes partial refill at an allied point", () => {
    const f = fixture();
    f.s.hpMilli -= 500000;
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      }),
    ).toBe("SUPPLY_STARTED");
    expect(f.p.supplyPoints).toBe(40);
    advance(f, 30);
    expect(f.s.hpMilli).toBe(2000000);
    expect(f.n.jobs).toHaveLength(0);
  });
  it("never resurrects dead squads and rejects enemy, forced, full and poor targets", () => {
    const f = fixture();
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: ["red-1-1"],
      }),
    ).toBe("NOT_OWNER");
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      }),
    ).toBe("NO_CAPACITY");
    f.s.hpMilli = 0;
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      }),
    ).toBe("FORCED_STATE");
    f.s.hpMilli = 1000000;
    f.s.morale = 0;
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      }),
    ).toBe("FORCED_STATE");
    f.s.morale = 100;
    f.p.supplyPoints = 0;
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      }),
    ).toBe("INSUFFICIENT_SUPPLY");
  });
  it("cancels with refund when a refill target leaves or its point is lost", () => {
    for (const leave of [true, false]) {
      const f = fixture();
      f.s.hpMilli = 1000000;
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RESUPPLY",
        squadIds: [f.s.id],
      });
      if (leave) f.s.position = { x: 12000, y: 7000 };
      else f.o.points[0]!.owner = "red";
      advance(f, 30);
      expect(f.p.supplyPoints).toBe(50);
      expect(f.s.hpMilli).toBe(1000000);
      expect(f.n.stats[f.p.id]!.feedback).toBe("SUPPLY_CANCELLED");
    }
  });
  it("requires rank capacity, builds paid new troops, and respects the 4/90 ceiling", () => {
    const f = fixture();
    const action = {
      type: "RECRUIT" as const,
      unitType: "cavalry" as const,
      squadIds: [],
    };
    expect(queueSupply(f.b, f.n, f.o, rules, f.p.id, action)).toBe(
      "RANK_CAPACITY",
    );
    f.p.merit = 10500;
    f.p.rank = "general";
    expect(queueSupply(f.b, f.n, f.o, rules, f.p.id, action)).toBe(
      "SUPPLY_STARTED",
    );
    expect(queueSupply(f.b, f.n, f.o, rules, f.p.id, action)).toBe(
      "SUPPLY_BUSY",
    );
    advance(f, 30);
    const recruited = f.b.squads.at(-1)!;
    expect(recruited.unitType).toBe("cavalry");
    expect(recruited.maxSoldiers).toBe(25);
    expect(recruited.hpMilli).toBe(1000000);
    f.p.supplyPoints = 1000;
    queueSupply(f.b, f.n, f.o, rules, f.p.id, action);
    advance(f, 60);
    expect(f.b.squads.filter((s) => s.ownerPlayerId === f.p.id)).toHaveLength(
      4,
    );
    expect(queueSupply(f.b, f.n, f.o, rules, f.p.id, action)).toBe(
      "RANK_CAPACITY",
    );
    for (const troop of f.b.squads.filter(
      (s) => s.ownerPlayerId === f.p.id && s.maxSoldiers === 25,
    )) {
      for (let i = 0; i < 3; i++) {
        expect(
          queueSupply(f.b, f.n, f.o, rules, f.p.id, {
            type: "RESUPPLY",
            squadIds: [troop.id],
          }),
        ).toBe("SUPPLY_STARTED");
        advance(f, f.b.tick + rules.jobTicks);
      }
    }
    expect(
      f.b.squads
        .filter((s) => s.ownerPlayerId === f.p.id)
        .reduce((n, s) => n + s.hpMilli / 100000, 0),
    ).toBe(90);
  });
  it("recruits using any eligible own squad at a friendly point", () => {
    const f = fixture();
    f.p.rank = "general";
    f.p.merit = 10500;
    f.s.position = { x: 12000, y: 7000 };
    expect(
      queueSupply(f.b, f.n, f.o, rules, f.p.id, {
        type: "RECRUIT",
        unitType: "spears",
        squadIds: [],
      }),
    ).toBe("SUPPLY_STARTED");
  });
  it("cancels recruitment when all own troops leave the supply point", () => {
    const f = fixture();
    f.p.rank = "general";
    f.p.merit = 10500;
    queueSupply(f.b, f.n, f.o, rules, f.p.id, {
      type: "RECRUIT",
      unitType: "infantry",
      squadIds: [],
    });
    f.b.squads
      .filter((s) => s.ownerPlayerId === f.p.id)
      .forEach((s) => (s.position = { x: 12000, y: 7000 }));
    advance(f, 30);
    expect(f.p.supplyPoints).toBe(50);
    expect(f.b.squads).toHaveLength(18);
  });
  it("rechecks capacity when work completes and refunds once", () => {
    const f = fixture();
    f.s.hpMilli = 1000000;
    queueSupply(f.b, f.n, f.o, rules, f.p.id, {
      type: "RESUPPLY",
      squadIds: [f.s.id],
    });
    f.s.hpMilli = 2000000;
    advance(f, 30);
    expect(f.p.supplyPoints).toBe(50);
    advance(f, 31);
    expect(f.p.supplyPoints).toBe(50);
  });
  it("credits effective enemy damage only, no overkill or duplicate tick rewards", () => {
    const f = fixture(),
      target = f.b.squads.find((s) => s.nationId === "red")!;
    const before = target.hpMilli;
    target.hpMilli = 0;
    f.b.tick = 1;
    const events = [
      {
        tick: 0,
        type: "ATTACK_HIT" as const,
        actorId: f.s.id,
        targetId: target.id,
        delta: -9999999,
      },
    ];
    advanceNational(
      f.b,
      f.n,
      f.o,
      rules,
      [...events, ...events],
      Object.fromEntries(f.o.points.map((p) => [p.id, p.owner])),
      { [target.id]: before },
    );
    expect(f.n.stats[f.p.id]!.damage).toBe(before);
    expect(f.p.xp).toBe(before / rules.damageXpDivisor);
    expect(() => advanceNational(f.b, f.n, f.o, rules, events, {}, {})).toThrow(
      "consecutive",
    );
  });
  it("awards capture to present contributors, keeps XP and merit independent and offers seven choices", () => {
    const f = fixture(),
      point = f.o.points.find((p) => p.id === "outer-west")!;
    point.owner = "blue";
    point.open = true;
    f.s.position = { ...point.position };
    f.b.tick = 1;
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
    expect(f.p.xp).toBe(rules.captureXp);
    expect(f.p.merit).toBe(rules.captureMerit);
    expect(f.b.players.find((p) => p.id === "blue-2")!.xp).toBe(0);
    const m = match();
    m.state.players[0]!.xp = rules.xpThresholds[39]!;
    m.advance();
    expect(m.state.players[0]!.level).toBe(40);
    for (const checkpoint of [5, 10, 16, 22, 28, 34, 38]) {
      const offer = m.state.augmentProgress.find(
        (a) => a.playerId === "blue-1",
      )!.offer!;
      expect(offer.checkpoint).toBe(checkpoint);
      expect(offer.candidates).toHaveLength(3);
      expect(
        m.submit("s0", {
          type: "SELECT_AUGMENT",
          squadIds: [],
          checkpoint,
          augmentId: offer.candidates[0],
        }).accepted,
      ).toBe(true);
      m.advance();
    }
    expect(
      m.state.augmentProgress.find((a) => a.playerId === "blue-1")!.selected,
    ).toHaveLength(7);
  });
});
describe("national clock, ranking and authority", () => {
  it.each([
    [9000, 100, 89, 0, true],
    [9000, 100, 90, 1, false],
    [10800, 100, 94, 1, true],
    [10800, 100, 95, 2, false],
    [12600, 100, 100, 2, true],
  ])("clock %i / %i:%i", (tick, first, second, phase, ended) => {
    const f = fixture();
    f.o.scores = { blue: first, red: second, green: 0 };
    f.n.phase = tick === 9000 ? 0 : tick === 10800 ? 1 : 2;
    const out = advance(f, tick);
    expect(!!out.result).toBe(ended);
    expect(f.n.phase).toBe(phase);
    if (tick === 12600) expect(out.result!.winner).toBeNull();
  });
  it("unification requires four uncontested points held continuously after 10min", () => {
    const f = fixture();
    for (const p of f.o.points.filter((p) => rules.unifyIds.includes(p.id))) {
      p.owner = "blue";
      p.open = true;
    }
    advance(f, 5999);
    expect(f.n.unifyTicks).toBe(0);
    for (let t = 6000; t < 6200; t++) advance(f, t);
    f.o.points.find((p) => p.id === "capital")!.contested = true;
    advance(f, 6200);
    expect(f.n.unifyTicks).toBe(0);
    f.o.points.find((p) => p.id === "capital")!.contested = false;
    let out = f.o;
    for (let t = 6201; t <= 6650; t++) out = advance(f, t);
    expect(out.result).toMatchObject({
      reason: "unification",
      winner: "blue",
      tick: 6650,
    });
  });
  it("ranks all human nations by merit/contribution/id and excludes AI", () => {
    const f = fixture();
    f.n.humanIds = ["blue-1", "red-1", "green-1"];
    f.b.players.find((p) => p.id === "red-1")!.merit = 100;
    f.b.players.find((p) => p.id === "green-1")!.merit = 100;
    f.n.stats["green-1"]!.contribution = 2;
    finishNationalRanking(f.b, f.n);
    expect(f.n.ranking.map((p) => p.playerId)).toEqual([
      "green-1",
      "red-1",
      "blue-1",
    ]);
  });
  it("requires three human nations, denies spoofing, projects allied growth only and freezes on drop/end", () => {
    const m = new AuthoritativeMatch("national", undefined, rules);
    m.join("a");
    m.join("b");
    expect(m.start("a").reason).toBe("NEED_THREE_NATIONS");
    m.join("c");
    m.start("a");
    expect(m.lobby.slots.filter((s) => s.occupant === "AI")).toHaveLength(6);
    expect(
      m.submit("a", { type: "RESUPPLY", squadIds: ["red-1-1"] }).reason,
    ).toBe("NOT_OWNER");
    expect(
      m.submit("a", {
        type: "RECRUIT",
        unitType: "spears",
        squadIds: [],
        merit: 10500,
      }).reason,
    ).toBe("INVALID_FORMAT");
    const v = m.view("blue");
    expect(v.nationalMatch!.players.map((p) => p.id)).toEqual([
      "blue-1",
      "blue-2",
      "blue-3",
    ]);
    v.nationalMatch!.players[0]!.xp = 999;
    expect(m.state.players[0]!.xp).toBe(0);
    m.drop("c");
    expect(m.advance()).toBeNull();
    m.reconnect("c");
    expect(m.advance()).not.toBeNull();
    m.leave("c");
    expect(m.national!.ranking).toHaveLength(3);
    expect(m.advance()).toBeNull();
    expect(m.objectiveMatch!.result!.reason).toBe("abandoned");
  });
  it("fills all nine seats without allowing a tenth or a late replacement", () => {
    const m = match(9);
    expect(m.join("tenth")).toBeNull();
    expect(m.national!.humanIds).toEqual([...nationalSlots]);
  });
});
