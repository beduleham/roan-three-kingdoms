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
    tickMs: positive,
    positionUnitsPerTile: positive,
    hpMilliPerHp: positive,
    modifierBasisPoints: positive,
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
