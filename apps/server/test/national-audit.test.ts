import { describe, it, expect } from "vitest";
import raw from "../../../experiments/phase7/legacy-national.v1.json";
import candidates from "../../../experiments/phase7/augment-candidates.v1.json";
import {
  nationalRulesSchema,
  advanceNational,
  queueSupply,
  augmentDefinitionsSchema,
} from "../../../packages/battle-core/dist/index.js";
import {
  processAugmentEvents,
  augmentBonus,
  cohesionDamageBp,
} from "../../../packages/battle-core/dist/augments.js";
import { AuthoritativeMatch, initialNationalBattle } from "../src/match.js";
import {
  auditNationalEconomy,
  allocateDamageProportionally,
  auditAugmentCatalog,
  snapshotNationalMetrics,
} from "../src/national-audit.js";
const rules = nationalRulesSchema.parse(raw);
describe("read-only national design audits", () => {
  it("reports unreachable capacity while retaining both original squads without granting troops", () => {
    const b = initialNationalBattle(rules),
      before = structuredClone(b),
      audit = auditNationalEconomy(b, rules);
    expect(audit.ranks.map((r) => [r.rank, r.gap])).toEqual([
      ["junior", 0],
      ["sima", 10],
      ["xiaowei", 0],
      ["zhonglangjiang", 10],
      ["general", 0],
    ]);
    expect(audit.ranks.at(-1)!.minimumSupplyToReach).toBe(140);
    expect(b).toEqual(before);
  });
  it("calculates per-player one-point idle income, not twice for two squads", () => {
    const audit = auditNationalEconomy(initialNationalBattle(rules), rules);
    expect(audit.idle[0]).toMatchObject({
      tick: 9000,
      xp: 3600,
      level: 12,
      merit: 5400,
      supply: 410,
      earnedAugments: 2,
    });
    expect(audit.idle[2]).toMatchObject({
      tick: 12600,
      xp: 5040,
      level: 15,
      merit: 7560,
    });
  });
  it("matches the live progression formulas for a stationary one-point player", () => {
    const m = new AuthoritativeMatch("national", undefined, rules);
    const short = { ...rules, checkpoints: [500, 600, 700] };
    const owners = Object.fromEntries(
      m.objectiveMatch!.points.map((p) => [p.id, p.owner]),
    );
    for (let tick = 1; tick <= 500; tick++) {
      m.state.tick = tick;
      m.objectiveMatch!.tick = tick;
      advanceNational(
        m.state,
        m.national!,
        m.objectiveMatch!,
        short,
        [],
        owners,
        {},
      );
    }
    const row = auditNationalEconomy(initialNationalBattle(rules), short)
      .idle[0]!;
    expect(m.state.players[0]).toMatchObject({
      xp: row.xp,
      merit: row.merit,
      level: row.level,
      rank: row.rank,
      supplyPoints: row.supply,
    });
  });
  it("exposes the manual recruitment lockout after losing every owned squad", () => {
    const m = new AuthoritativeMatch("national", undefined, rules);
    m.state.squads
      .filter((s) => s.ownerPlayerId === "blue-1")
      .forEach((s) => (s.hpMilli = 0));
    expect(m.state.players[0]!.supplyPoints).toBeGreaterThanOrEqual(
      rules.recruitCost,
    );
    expect(
      queueSupply(m.state, m.national!, m.objectiveMatch!, rules, "blue-1", {
        type: "RECRUIT",
        unitType: "infantry",
        squadIds: [],
      }),
    ).toBe("NOT_OWNER");
  });
  it("exposes current overkill credit dependence on attack-event order", () => {
    const credits = (reverse: boolean) => {
      const m = new AuthoritativeMatch("national", undefined, rules),
        target = m.state.squads.find((s) => s.id === "green-1-1")!;
      const before = target.hpMilli;
      target.hpMilli -= 90000;
      m.state.tick = 1;
      m.objectiveMatch!.tick = 1;
      const owners = Object.fromEntries(
        m.objectiveMatch!.points.map((p) => [p.id, p.owner]),
      );
      const events = [
        {
          type: "ATTACK_HIT" as const,
          tick: 0,
          actorId: "blue-1-1",
          targetId: target.id,
          delta: -200000,
        },
        {
          type: "ATTACK_HIT" as const,
          tick: 0,
          actorId: "red-1-1",
          targetId: target.id,
          delta: -100000,
        },
      ];
      advanceNational(
        m.state,
        m.national!,
        m.objectiveMatch!,
        rules,
        reverse ? events.reverse() : events,
        owners,
        { [target.id]: before },
      );
      return [
        m.national!.stats["blue-1"]!.damage,
        m.national!.stats["red-1"]!.damage,
      ];
    };
    expect(credits(false)).toEqual([90000, 0]);
    expect(credits(true)).toEqual([0, 90000]);
  });
  it("exposes production AI target dependence on objective-array order", () => {
    const a = new AuthoritativeMatch("national", undefined, rules),
      reversed = structuredClone(rules);
    reversed.objectives.points.reverse();
    const b = new AuthoritativeMatch("national", undefined, reversed);
    expect(a.nationalAICommand("blue-1")!.destination).not.toEqual(
      b.nationalAICommand("blue-1")!.destination,
    );
  });
  it("distinguishes nine IDs from three mechanics and proves offers do not vary by seed", () => {
    const b = initialNationalBattle(rules);
    expect(auditAugmentCatalog(b)).toMatchObject({
      ids: 9,
      uniqueMechanics: 3,
    });
    const offers = [41, 42].map((seed) => {
      const b = initialNationalBattle(rules, seed),
        m = new AuthoritativeMatch("national", undefined, rules);
      m.state = b;
      for (let i = 0; i < 3; i++) m.join(String(i));
      m.start("0");
      m.state.players[0]!.xp = 640;
      m.advance();
      return m.state.augmentProgress[0]!.offer;
    });
    expect(offers[0]).toEqual(offers[1]);
  });
  it("reports separate damage/merit/XP/supply and only living soldiers", () => {
    const m = new AuthoritativeMatch("national", undefined, rules);
    m.state.squads[0]!.hpMilli = 0;
    const metric = snapshotNationalMetrics(m.state, m.national!)[0]!;
    expect(metric).toMatchObject({
      squads: 1,
      soldiers: 20,
      xp: 0,
      merit: 0,
      supply: 50,
      damage: 0,
      contribution: 0,
    });
  });
});
describe("isolated proposed augment catalog (never production enabled)", () => {
  const defs = augmentDefinitionsSchema.parse(candidates);
  it("contains nine different mechanics, gates R content and supports seven valid choices", () => {
    const m = new AuthoritativeMatch("national", undefined, rules);
    m.state.augmentDefinitions = structuredClone(defs);
    expect(auditAugmentCatalog(m.state)).toMatchObject({
      ids: 9,
      uniqueMechanics: 9,
    });
    expect(
      defs.filter((d) => d.sourceSkill === "R").every((d) => d.minLevel >= 15),
    ).toBe(true);
    for (let i = 0; i < 3; i++) m.join(String(i));
    m.start("0");
    m.state.players[0]!.xp = rules.xpThresholds[39]!;
    m.advance();
    const projected = m.view("blue").nationalMatch!.players[0]!.offer!.details!;
    expect(projected).toHaveLength(3);
    const original = m.state.augmentDefinitions.find(
      (d) => d.id === projected[0]!.id,
    )!.effect.bonusBp;
    projected[0]!.effect.bonusBp = 1;
    expect(
      m.state.augmentDefinitions.find((d) => d.id === projected[0]!.id)!.effect
        .bonusBp,
    ).toBe(original);
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
    expect(new Set(m.state.augmentProgress[0]!.selected).size).toBe(7);
    expect(
      new AuthoritativeMatch("national", undefined, rules).state
        .augmentDefinitions[0]!.id,
    ).toMatch(/^national-/);
  });
  it.each(defs)(
    "activates and expires $id only on its matching trusted skill event",
    (d) => {
      const b = initialNationalBattle(rules),
        owner = "blue-1",
        squad = b.squads[0]!,
        commander = b.commanders[0]!;
      b.augmentDefinitions = [d];
      b.augmentProgress.find((a) => a.playerId === owner)!.selected = [d.id];
      b.tick = 1;
      b.augmentProcessedTick = 0;
      const event = {
        type:
          d.sourceSkill === "Q"
            ? ("CHARGE_IMPACT" as const)
            : ("SKILL_CAST" as const),
        actorId: d.sourceSkill === "Q" ? squad.id : commander.id,
        tick: 1,
        sourceCommanderId: commander.id,
        sourceCommandSeq: 1,
        skill: d.sourceSkill!,
        targetSquadIds: [squad.id],
        effectId: "test",
      };
      processAugmentEvents(
        b,
        [{ ...event, skill: d.sourceSkill === "Q" ? "W" : "Q" }],
        () => {},
      );
      expect(b.augmentEffects).toHaveLength(0);
      b.tick = 2;
      processAugmentEvents(b, [{ ...event, tick: 2 }], () => {});
      expect(b.augmentEffects).toHaveLength(1);
      b.tick = 3;
      if (d.effect.stat === "cohesionDamageReduction")
        expect(cohesionDamageBp(b, squad)).toBe(10000 - d.effect.bonusBp);
      else expect(augmentBonus(b, squad, d.effect.stat)).toBe(d.effect.bonusBp);
      b.tick = b.augmentEffects[0]!.expiresAt;
      if (d.effect.stat === "cohesionDamageReduction")
        expect(cohesionDamageBp(b, squad)).toBe(10000);
      else expect(augmentBonus(b, squad, d.effect.stat)).toBe(0);
    },
  );
});

describe("proposed proportional effective damage credit (offline only)", () => {
  const claims = [
    { claimId: "a1", actorId: "a", targetId: "enemy", damage: 200 },
    { claimId: "b1", actorId: "b", targetId: "enemy", damage: 100 },
  ];
  it("conserves effective HP budget and is invariant to event order", () => {
    const a = allocateDamageProportionally(claims, { enemy: 90 });
    expect(a).toEqual([
      { actorId: "a", damage: 60 },
      { actorId: "b", damage: 30 },
    ]);
    expect(
      allocateDamageProportionally([...claims].reverse(), { enemy: 90 }),
    ).toEqual(a);
  });
  it("handles integer remainder deterministically without creating overkill credit", () => {
    expect(
      allocateDamageProportionally(
        claims.map((c) => ({ ...c, damage: 100 })),
        { enemy: 1 },
      ),
    ).toEqual([
      { actorId: "a", damage: 1 },
      { actorId: "b", damage: 0 },
    ]);
    expect(allocateDamageProportionally(claims, { enemy: 999 })).toEqual([
      { actorId: "a", damage: 200 },
      { actorId: "b", damage: 100 },
    ]);
  });
  it("deduplicates stable claim identities and rejects conflicting identities/invalid input", () => {
    expect(
      allocateDamageProportionally([...claims, claims[0]!], { enemy: 90 }),
    ).toEqual(allocateDamageProportionally(claims, { enemy: 90 }));
    expect(() =>
      allocateDamageProportionally([...claims, { ...claims[0]!, damage: 1 }], {
        enemy: 90,
      }),
    ).toThrow("Conflicting");
    expect(() => allocateDamageProportionally(claims, { enemy: -1 })).toThrow();
    expect(() =>
      allocateDamageProportionally([{ ...claims[0]!, damage: 0.5 }], {
        enemy: 90,
      }),
    ).toThrow();
  });
  it("bounds cumulative credit over multiple targets", () => {
    const c = [
      ...claims,
      { claimId: "a2", actorId: "a", targetId: "other", damage: 40 },
    ];
    expect(allocateDamageProportionally(c, { enemy: 90, other: 20 })).toEqual([
      { actorId: "a", damage: 80 },
      { actorId: "b", damage: 30 },
    ]);
  });
});
