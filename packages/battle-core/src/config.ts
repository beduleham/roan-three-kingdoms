import { z } from "zod";

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = integer.positive();
const bp = integer;
const percent = integer.max(100);
const unitRecord = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    infantry: value,
    spears: value,
    archers: value,
    cavalry: value,
  });
const unit = z.strictObject({
  dpsPerSoldier: positive,
  defense: integer,
  speedTilesPerSec: z.number().positive().finite(),
  rangeTiles: z.number().positive().finite(),
});
const direction = z.strictObject({
  damageBp: bp,
  cohesionImpact: percent,
  moraleImpact: percent,
});
const formation = z.strictObject({
  attackBp: bp,
  incomingDamageBp: bp,
  speedBp: bp,
});
const rank = z.strictObject({
  minMerit: integer,
  squads: positive,
  soldiers: positive,
});

export const battleConfigSchema = z
  .strictObject({
    schemaVersion: z.literal("1.9-draft"),
    designStatus: z.literal("design-assumptions-not-validated"),
    tickMs: z.literal(100),
    positionUnitsPerTile: positive,
    visibility: z.strictObject({ radiusTiles: positive }).optional(),
    hpMilliPerHp: z.literal(1000),
    modifierBasisPoints: z.literal(10000),
    soldierHp: positive,
    baseEngagementBp: bp,
    unitTypes: unitRecord(unit),
    matchupBp: unitRecord(unitRecord(bp)),
    preparedSpearCounter: z.strictObject({
      spearsVsCavalryBp: bp,
      cavalryVsSpearsBp: bp,
    }),
    directions: z.strictObject({
      front: direction,
      flank: direction,
      rear: direction,
    }),
    formations: z.strictObject({
      normal: formation,
      defense: formation,
      offense: formation,
    }),
    formationSwitchTicks: positive,
    moraleDamageBp: z.strictObject({ normal: bp, wavering: bp, panicked: bp }),
    moraleBands: z.strictObject({
      normalFrom: percent,
      waveringFrom: percent,
      panickedFrom: percent,
    }),
    status: z.strictObject({
      routTicks: positive,
      routRecoveryMorale: percent,
      breakTicks: positive,
      breakRecoveryCohesion: percent,
      breakImmunityTicks: positive,
      regroupDelayTicks: integer,
      cohesionRecoveryPerSecond: integer,
      safeMoraleRecoveryPerSecond: integer,
    }),
    ai: z.strictObject({
      defensiveChaseRadiusTiles: integer,
      balancedChaseRadiusTiles: integer,
      aggressiveChaseRadiusTiles: integer,
    }),
    commander: z.strictObject({
      baseHp: positive,
      woundedRespawnTicks: positive,
      commandRadiusTiles: positive,
    }),
    warriorSkills: z.strictObject({
      Q: z.strictObject({
        id: z.literal("warrior_charge"),
        cooldownTicks: positive,
        cohesionDamage: percent,
        moraleDamage: percent,
      }),
      W: z.strictObject({
        id: z.literal("warrior_rally"),
        cooldownTicks: positive,
        targetSquadLimit: positive,
        moraleRestore: percent,
        attackBonusBp: bp,
        durationTicks: positive,
      }),
      R: z.strictObject({
        id: z.literal("warrior_breakthrough"),
        minLevel: positive.max(40),
        cooldownTicks: positive,
        targetSquadLimit: positive,
        chargeImpactBonusBp: bp,
        speedBonusBp: bp,
        durationTicks: positive,
        routExtensionTicks: integer,
        maxRoutExtensions: integer,
      }),
    }),
    warriorAssumptions: z.strictObject({
      designStatus: z.literal("provisional-not-balance-validated"),
      commanderMoveUnitsPerTick: positive,
      protectedSoldiersPercent: integer.max(100),
      weakenedSoldiersPercent: integer.max(100),
      protectedCohesionMin: integer.max(100),
      protectedDamageShareBp: integer.max(10000),
      weakenedDamageShareBp: integer.max(10000),
      exposedDamageShareBp: integer.max(10000),
      chargePreparationUnits: positive,
      chargeCollisionRadiusUnits: positive,
      chargeMaxTravelUnits: positive,
      chargePathToleranceUnits: integer,
      chargeMaxDurationTicks: positive,
      chargeObstructionPolicy: z.literal("cancel-on-other-enemy"),
      reassignmentPolicy: z.literal("retarget-from-current-position"),
      effectStacking: z.literal("refresh-source-max-across-sources"),
      rallyRestorePolicy: z.literal("only-without-active-rally"),
      disabledSourcePolicy: z.literal("remove-effects-and-charge"),
      respawnPolicy: z.literal("designated-friendly-zone-only"),
    }),
    augmentLevels: z.array(positive.max(40)).min(1),
    rankCaps: z.strictObject({
      junior: rank,
      sima: rank,
      xiaowei: rank,
      zhonglangjiang: rank,
      general: rank,
    }),
    globalDamageReductionCapBp: bp,
    sampleExpectedDamage: z.strictObject({
      infantry20VsDefense25OneTickHpMilli: positive,
    }),
  })
  .superRefine((config, ctx) => {
    if (
      config.visibility &&
      !Number.isSafeInteger(
        config.visibility.radiusTiles * config.positionUnitsPerTile,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["visibility", "radiusTiles"],
        message: "Vision radius exceeds safe integer range",
      });
    const rules = config.warriorAssumptions;
    if (
      rules.chargeMaxTravelUnits <=
        rules.chargePreparationUnits + rules.chargeCollisionRadiusUnits ||
      rules.protectedSoldiersPercent <= rules.weakenedSoldiersPercent ||
      rules.protectedDamageShareBp > rules.weakenedDamageShareBp ||
      rules.weakenedDamageShareBp > rules.exposedDamageShareBp
    )
      ctx.addIssue({
        code: "custom",
        path: ["warriorAssumptions"],
        message: "Invalid provisional threshold ordering",
      });
    for (const key of [
      "baseEngagementBp",
      "globalDamageReductionCapBp",
    ] as const) {
      if (config[key] > config.modifierBasisPoints)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Must not exceed modifierBasisPoints",
        });
    }
    if (!(
      config.moraleBands.normalFrom > config.moraleBands.waveringFrom &&
      config.moraleBands.waveringFrom > config.moraleBands.panickedFrom
    ))
      ctx.addIssue({
        code: "custom",
        path: ["moraleBands"],
        message: "Thresholds must be strictly descending",
      });
    if (
      config.augmentLevels.some(
        (level, index, levels) => index > 0 && level <= levels[index - 1]!,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["augmentLevels"],
        message: "Levels must be strictly increasing",
      });
  });

export type BattleConfig = z.infer<typeof battleConfigSchema>;

export function parseBattleConfig(input: unknown): BattleConfig {
  const result = battleConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      "Invalid battle config: " +
        result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
    );
  }
  return result.data;
}
