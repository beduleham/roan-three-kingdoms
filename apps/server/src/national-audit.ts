/** Read-only design diagnostics. Never imported by production room/index. */
import type {
  NationalRules,
  BattleState,
} from "../../../packages/battle-core/dist/index.js";
import { livingSoldiers } from "../../../packages/battle-core/dist/index.js";
export function auditNationalEconomy(b: BattleState, r: NationalRules) {
  const owner = b.players[0]!.id,
    original = b.squads.filter((s) => s.ownerPlayerId === owner),
    initial = original.reduce((n, s) => n + livingSoldiers(s, b.config), 0),
    originalMax = original.reduce((n, s) => n + s.maxSoldiers, 0);
  const ranks = Object.entries(b.config.rankCaps).map(([rank, c]) => {
    const rankOriginalMax = r.policy
      ? original.reduce(
          (n, s) =>
            n +
            Math.max(
              s.maxSoldiers,
              r.policy!.unitCapacity[
                rank as keyof typeof r.policy.unitCapacity
              ],
            ),
          0,
        )
      : originalMax;
    const recruits = Math.max(0, c.squads - original.length),
      reachable = Math.min(
        c.soldiers,
        rankOriginalMax + recruits * r.recruitMaxSoldiers,
      );
    const recruitCount = Math.min(
      recruits,
      Math.ceil(
        Math.max(0, reachable - rankOriginalMax) / r.recruitMaxSoldiers,
      ),
    );
    const refill = Math.max(
      0,
      reachable - initial - recruitCount * r.recruitSoldiers,
    );
    const cost = recruitCount * r.recruitCost + refill * r.supplyCostPerSoldier;
    return {
      rank,
      merit: c.minMerit,
      squadCap: c.squads,
      soldierCap: c.soldiers,
      reachableKeepingOriginalSquads: reachable,
      gap: c.soldiers - reachable,
      minimumSupplyToReach: cost,
      minimumSequentialJobTicks:
        recruitCount * r.jobTicks +
        Math.ceil(refill / r.refillSoldiers) * r.jobTicks,
    };
  });
  const idle = r.checkpoints.map((tick) => {
    const holds =
        r.policy && !r.policy.homePresenceRewards
          ? 0
          : Math.floor(tick / r.objectives.scoreEveryTicks),
      xp = holds * r.holdXp,
      merit = holds * r.holdMerit;
    const income = Math.floor(tick / r.supplyEveryTicks) * r.supplyPerPoint;
    return {
      tick,
      xp,
      level: r.xpThresholds.filter((x) => x <= xp).length,
      merit,
      rank: Object.entries(b.config.rankCaps)
        .filter(([, c]) => c.minMerit <= merit)
        .at(-1)![0],
      supply: r.initialSupply + income,
      earnedAugments: b.config.augmentLevels.filter(
        (l) => l <= r.xpThresholds.filter((x) => x <= xp).length,
      ).length,
    };
  });
  return {
    assumptions:
      "one original player, both original squads retained; one uncontested owned home point throughout; no damage/capture/spending. Job lower bound ignores rank/income waits.",
    ranks,
    idle,
  };
}
export function auditAugmentCatalog(b: BattleState) {
  const groups = new Map<string, string[]>();
  for (const d of b.augmentDefinitions) {
    const { id, version, designStatus, ...mechanics } = d;
    const signature = JSON.stringify(mechanics);
    groups.set(signature, [...(groups.get(signature) ?? []), id]);
  }
  return {
    ids: b.augmentDefinitions.length,
    uniqueMechanics: groups.size,
    duplicateGroups: [...groups.values()].filter((g) => g.length > 1),
    checkpoints: [...b.config.augmentLevels],
    candidateCount: 3,
    selectionPolicy:
      b.choicePolicy?.augmentOffers === "seeded"
        ? "seed/player/checkpoint ranked eligible unselected IDs"
        : "first three eligible unselected IDs sorted lexically; seed does not randomize offers",
  };
}
export function snapshotNationalMetrics(
  b: BattleState,
  n: { stats: Record<string, { contribution: number; damage: number }> },
) {
  return b.players.map((p) => {
    const squads = b.squads.filter(
        (s) => s.ownerPlayerId === p.id && s.hpMilli > 0,
      ),
      cap = b.config.rankCaps[p.rank];
    return {
      id: p.id,
      nation: p.nationId,
      xp: p.xp,
      level: p.level,
      merit: p.merit,
      rank: p.rank,
      supply: p.supplyPoints,
      squads: squads.length,
      soldiers: squads.reduce((v, s) => v + livingSoldiers(s, b.config), 0),
      squadCap: cap.squads,
      soldierCap: cap.soldiers,
      damage: n.stats[p.id]!.damage,
      contribution: n.stats[p.id]!.contribution,
      earned: b.config.augmentLevels.filter((l) => l <= p.level).length,
    };
  });
}

export { allocateDamageProportionally } from "../../../packages/battle-core/dist/index.js";
