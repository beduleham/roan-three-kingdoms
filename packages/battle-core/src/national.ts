import { z } from "zod";
import type { BattleState, BattleEvent, Player } from "./model.js";
import { squadSchema } from "./model.js";
import { livingSoldiers } from "./damage.js";
import { offerAugments } from "./augments.js";
import {
  objectiveRulesSchema,
  finishObjectiveMatch,
  type ObjectiveMatchState,
} from "./objectives.js";
const positive = z.number().int().positive().max(1000000);
export const nationalRulesSchema = z
  .strictObject({
    experimental: z.literal(true),
    objectives: objectiveRulesSchema,
    bases: z.record(z.string(), z.string()),
    checkpoints: z.array(positive).length(3),
    gapBp: z.array(z.number().int().min(0).max(10000)).length(3),
    unifyAfterTick: positive,
    unifyHoldTicks: positive,
    unifyIds: z.array(z.string()).length(4),
    initialSupply: positive,
    supplyEveryTicks: positive,
    supplyPerPoint: positive,
    supplyCostPerSoldier: positive,
    refillSoldiers: positive,
    jobTicks: positive,
    recruitCost: positive,
    recruitSoldiers: positive,
    recruitMaxSoldiers: positive,
    captureXp: positive,
    captureMerit: positive,
    holdXp: positive,
    holdMerit: positive,
    damageXpDivisor: positive,
    damageMeritDivisor: positive,
    xpThresholds: z
      .array(z.number().int().nonnegative().max(100000000))
      .length(40),
    aiEveryTicks: positive,
    augmentCopies: z.number().int().min(3).max(3),
  })
  .superRefine((r, c) => {
    if (
      r.xpThresholds[0] !== 0 ||
      r.xpThresholds.some((x, i) => i > 0 && x <= r.xpThresholds[i - 1]!) ||
      r.checkpoints.some((x, i) => i > 0 && x <= r.checkpoints[i - 1]!)
    )
      c.addIssue({ code: "custom", message: "Nonascending progression/clock" });
    const ids = new Set(r.objectives.points.map((p) => p.id));
    if (
      Object.keys(r.bases).length !== 3 ||
      Object.values(r.bases).some((id) => !ids.has(id)) ||
      new Set(r.unifyIds).size !== 4 ||
      r.unifyIds.some((id) => !ids.has(id)) ||
      r.recruitSoldiers > r.recruitMaxSoldiers
    )
      c.addIssue({
        code: "custom",
        message: "Invalid national layout/capacity",
      });
  });
export type NationalRules = z.infer<typeof nationalRulesSchema>;
export const economyActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("RESUPPLY"),
    squadIds: z.array(z.string()).length(1),
  }),
  z.strictObject({
    type: z.literal("RECRUIT"),
    unitType: z.enum(["infantry", "spears", "archers", "cavalry"]),
    squadIds: z.array(z.string()).length(0).default([]),
  }),
]);
export type EconomyAction = z.infer<typeof economyActionSchema>;
export interface SupplyJob {
  playerId: string;
  squadId: string | null;
  unitType: "infantry" | "spears" | "archers" | "cavalry";
  finishAt: number;
  soldiers: number;
  cost: number;
  pointId: string;
}
export interface NationalProgress {
  processedTick: number;
  phase: number;
  unifyNation: string | null;
  unifyTicks: number;
  humanIds: string[];
  jobs: SupplyJob[];
  nextSquad: number;
  stats: Record<
    string,
    { contribution: number; damage: number; feedback: string }
  >;
  ranking: {
    playerId: string;
    nationId: string;
    human: boolean;
    merit: number;
    contribution: number;
    xp: number;
    level: number;
    rank: string;
    place: number;
  }[];
}
export function createNationalProgress(battle: BattleState): NationalProgress {
  return {
    processedTick: 0,
    phase: 0,
    unifyNation: null,
    unifyTicks: 0,
    humanIds: [],
    jobs: [],
    nextSquad: 1,
    stats: Object.fromEntries(
      battle.players.map((p) => [
        p.id,
        { contribution: 0, damage: 0, feedback: "" },
      ]),
    ),
    ranking: [],
  };
}
function eligible(s: BattleState["squads"][number]) {
  return (
    s.hpMilli > 0 &&
    s.morale > 0 &&
    s.cohesion > 0 &&
    !["ROUTED", "BROKEN", "RETREAT", "DEFEATED"].includes(s.fsmState) &&
    s.order?.type !== "RETREAT"
  );
}
function near(
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number,
) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= radius ** 2;
}
function cap(b: BattleState, p: Player) {
  return b.config.rankCaps[p.rank];
}
function capacity(b: BattleState, p: Player) {
  return b.squads
    .filter((s) => s.ownerPlayerId === p.id && s.hpMilli > 0)
    .reduce((n, s) => n + livingSoldiers(s, b.config), 0);
}
export function queueSupply(
  b: BattleState,
  n: NationalProgress,
  o: ObjectiveMatchState,
  r: NationalRules,
  playerId: string,
  action: EconomyAction,
): string {
  const p = b.players.find((p) => p.id === playerId);
  if (!p) return "NO_PLAYER";
  if (o.result) return "MATCH_FINISHED";
  if (n.jobs.some((j) => j.playerId === playerId)) return "SUPPLY_BUSY";
  const squad =
    action.type === "RESUPPLY"
      ? b.squads.find((s) => s.id === action.squadIds[0])
      : b.squads.find(
          (s) =>
            s.ownerPlayerId === playerId &&
            eligible(s) &&
            o.points.some(
              (point) =>
                point.open &&
                point.owner === p.nationId &&
                !point.contested &&
                !point.capturing &&
                near(point.position, s.position, r.objectives.radiusUnits),
            ),
        );
  if (!squad || squad.ownerPlayerId !== playerId) return "NOT_OWNER";
  if (!eligible(squad)) return "FORCED_STATE";
  const point = o.points.find(
    (point) =>
      point.open &&
      point.owner === p.nationId &&
      !point.contested &&
      !point.capturing &&
      near(point.position, squad.position, r.objectives.radiusUnits),
  );
  if (!point) return "NEED_FRIENDLY_POINT";
  let soldiers = r.recruitSoldiers,
    cost = r.recruitCost;
  if (action.type === "RESUPPLY") {
    soldiers = Math.min(
      r.refillSoldiers,
      squad.maxSoldiers - livingSoldiers(squad, b.config),
      cap(b, p).soldiers - capacity(b, p),
    );
    cost = soldiers * r.supplyCostPerSoldier;
    if (soldiers <= 0) return "NO_CAPACITY";
  } else if (
    b.squads.filter((s) => s.ownerPlayerId === p.id && s.hpMilli > 0).length >=
      cap(b, p).squads ||
    capacity(b, p) + soldiers > cap(b, p).soldiers
  )
    return "RANK_CAPACITY";
  if (p.supplyPoints < cost) return "INSUFFICIENT_SUPPLY";
  p.supplyPoints -= cost;
  n.jobs.push({
    playerId,
    squadId: action.type === "RESUPPLY" ? squad.id : null,
    unitType: action.type === "RECRUIT" ? action.unitType : squad.unitType,
    finishAt: b.tick + r.jobTicks,
    soldiers,
    cost,
    pointId: point.id,
  });
  return "SUPPLY_STARTED";
}
export function finishNationalRanking(b: BattleState, n: NationalProgress) {
  const sorted = b.players
    .filter((p) => n.humanIds.includes(p.id))
    .sort(
      (a, b) =>
        b.merit - a.merit ||
        n.stats[b.id]!.contribution - n.stats[a.id]!.contribution ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  n.ranking = sorted.map((p, i) => ({
    playerId: p.id,
    nationId: p.nationId,
    human: true,
    merit: p.merit,
    contribution: n.stats[p.id]!.contribution,
    xp: p.xp,
    level: p.level,
    rank: p.rank,
    place: i + 1,
  }));
}
/** Runs once per completed combat tick on server-owned clones; no rewards from elapsed wall time. */
export function advanceNational(
  b: BattleState,
  n: NationalProgress,
  o: ObjectiveMatchState,
  r: NationalRules,
  events: readonly BattleEvent[],
  previousOwners: Record<string, string | null>,
  damageBefore: Record<string, number>,
) {
  if (b.tick !== n.processedTick + 1)
    throw Error("National progression requires consecutive ticks");
  n.processedTick = b.tick;
  const budgets = Object.fromEntries(
    b.squads.map((s) => [
      s.id,
      Math.max(0, (damageBefore[s.id] ?? s.hpMilli) - s.hpMilli),
    ]),
  );
  for (const event of events)
    if (event.type === "ATTACK_HIT" && event.delta && event.delta < 0) {
      const attacker = b.squads.find((s) => s.id === event.actorId),
        target = b.squads.find((s) => s.id === event.targetId);
      if (!attacker || !target || attacker.nationId === target.nationId)
        continue;
      const stats = n.stats[attacker.ownerPlayerId]!;
      const before = stats.damage;
      const effective = Math.min(-event.delta, budgets[target.id] ?? 0);
      budgets[target.id] = (budgets[target.id] ?? 0) - effective;
      stats.damage += effective;
      const p = b.players.find((p) => p.id === attacker.ownerPlayerId)!;
      p.xp +=
        Math.floor(stats.damage / r.damageXpDivisor) -
        Math.floor(before / r.damageXpDivisor);
      p.merit +=
        Math.floor(stats.damage / r.damageMeritDivisor) -
        Math.floor(before / r.damageMeritDivisor);
    }
  for (const point of o.points) {
    if (!point.open || !point.owner || point.contested || point.capturing)
      continue;
    const captured = previousOwners[point.id] !== point.owner;
    const holding = b.tick % r.objectives.scoreEveryTicks === 0;
    for (const p of b.players.filter((p) => p.nationId === point.owner)) {
      if (b.tick % r.supplyEveryTicks === 0) p.supplyPoints += r.supplyPerPoint;
      if (
        b.squads.some(
          (s) =>
            s.ownerPlayerId === p.id &&
            eligible(s) &&
            near(s.position, point.position, r.objectives.radiusUnits),
        )
      ) {
        if (captured) {
          p.xp += r.captureXp;
          p.merit += r.captureMerit;
          n.stats[p.id]!.contribution++;
        }
        if (holding) {
          p.xp += r.holdXp;
          p.merit += r.holdMerit;
          n.stats[p.id]!.contribution++;
        }
      }
    }
  }
  for (const p of b.players) {
    p.level = Math.max(1, r.xpThresholds.filter((x) => p.xp >= x).length);
    const ranks = Object.entries(b.config.rankCaps) as [
      Player["rank"],
      { minMerit: number },
    ][];
    p.rank = ranks.filter(([, v]) => p.merit >= v.minMerit).at(-1)![0];
  }
  for (const job of n.jobs.filter((j) => j.finishAt <= b.tick)) {
    const p = b.players.find((p) => p.id === job.playerId)!,
      point = o.points.find((p) => p.id === job.pointId)!;
    const squad = b.squads.find((s) => s.id === job.squadId);
    let reason = "SUPPLY_COMPLETE";
    if (
      point.owner !== p.nationId ||
      point.contested ||
      point.capturing ||
      !point.open ||
      (!job.squadId &&
        !b.squads.some(
          (s) =>
            s.ownerPlayerId === p.id &&
            eligible(s) &&
            near(s.position, point.position, r.objectives.radiusUnits),
        )) ||
      (job.squadId &&
        (!squad ||
          !eligible(squad) ||
          !near(squad.position, point.position, r.objectives.radiusUnits)))
    )
      reason = "SUPPLY_CANCELLED";
    else if (capacity(b, p) + job.soldiers > cap(b, p).soldiers)
      reason = "RANK_CAPACITY";
    else if (squad) {
      squad.hpMilli = Math.min(
        squad.maxSoldiers * b.config.soldierHp * b.config.hpMilliPerHp,
        squad.hpMilli +
          job.soldiers * b.config.soldierHp * b.config.hpMilliPerHp,
      );
    } else if (
      b.squads.filter((s) => s.ownerPlayerId === p.id && s.hpMilli > 0).length <
      cap(b, p).squads
    ) {
      b.squads.push(
        squadSchema.parse({
          id: `${p.id}-recruit-${n.nextSquad++}`,
          ownerPlayerId: p.id,
          nationId: p.nationId,
          unitType: job.unitType,
          position: { ...point.position },
          maxSoldiers: r.recruitMaxSoldiers,
          hpMilli: job.soldiers * b.config.soldierHp * b.config.hpMilliPerHp,
          stance: "defensive",
        }),
      );
    } else reason = "RANK_CAPACITY";
    if (reason !== "SUPPLY_COMPLETE") p.supplyPoints += job.cost;
    n.stats[p.id]!.feedback = reason;
  }
  n.jobs = n.jobs.filter((j) => j.finishAt > b.tick);
  offerAugments(b, () => {});
  const controller = Object.keys(r.bases).find((nation) =>
    r.unifyIds.every((id) =>
      o.points.some(
        (p) =>
          p.id === id && p.owner === nation && !p.contested && !p.capturing,
      ),
    ),
  );
  if (b.tick >= r.unifyAfterTick && controller) {
    n.unifyTicks = n.unifyNation === controller ? n.unifyTicks + 1 : 1;
    n.unifyNation = controller;
  } else {
    n.unifyTicks = 0;
    n.unifyNation = null;
  }
  let outcome = o;
  if (n.unifyTicks >= r.unifyHoldTicks) {
    outcome = finishObjectiveMatch(o, "unification");
    if (outcome.result) outcome.result.winner = n.unifyNation;
  } else if (b.tick >= r.checkpoints[n.phase]!) {
    const scores = Object.values(o.scores).sort((a, b) => b - a);
    if (
      n.phase === 2 ||
      (scores[0]! > 0 &&
        (scores[0]! - scores[1]!) * 10000 > scores[0]! * r.gapBp[n.phase]!)
    )
      outcome = finishObjectiveMatch(o, "time");
    else n.phase++;
  }
  if (outcome.result) finishNationalRanking(b, n);
  return outcome;
}
