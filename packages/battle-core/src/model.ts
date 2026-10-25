import {
  augmentDefinitionsSchema,
  type AugmentDefinition,
  type AugmentProgress,
  type AugmentEffect,
} from "./augments.js";
import { z } from "zod";
import type { BattleConfig } from "./config.js";

export const natural = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1);
const percent = natural.max(100);
export const positionSchema = z.strictObject({
  x: z.number().int().safe(),
  y: z.number().int().safe(),
});
const formation = z.enum(["normal", "defense", "offense"]);
const stance = z.enum(["defensive", "balanced", "aggressive"]);
export const orderSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("ATTACK"),
    targetSquadId: id,
    seq: natural,
  }),
  z.strictObject({
    type: z.enum(["MOVE", "ATTACK_MOVE", "RETREAT"]),
    destination: positionSchema,
    seq: natural,
  }),
]);
export const squadSchema = z
  .strictObject({
    id,
    ownerPlayerId: id,
    nationId: id,
    unitType: z.enum(["infantry", "spears", "archers", "cavalry"]),
    position: positionSchema.default({ x: 0, y: 0 }),
    anchor: positionSchema.optional(),
    facing: positionSchema
      .refine((p) => p.x !== 0 || p.y !== 0, "Facing must be nonzero")
      .default({ x: 1, y: 0 }),
    stance: stance.default("balanced"),
    order: orderSchema.nullable().default(null),
    charge: z
      .strictObject({
        sourceCommanderId: id,
        sourceCommandSeq: natural,
        targetSquadId: id,
        start: positionSchema,
        destination: positionSchema,
        expiresAt: natural,
      })
      .nullable()
      .default(null),
    currentTargetId: id.nullable().default(null),
    maxSoldiers: natural.positive(),
    hpMilli: natural,
    morale: percent.default(100),
    cohesion: percent.default(100),
    formation: formation.default("normal"),
    pendingFormation: formation.nullable().default(null),
    formationRemainingTicks: natural.default(0),
    fsmState: z
      .enum([
        "IDLE",
        "MOVE",
        "ENGAGE",
        "CHASE",
        "CHARGE",
        "RETURN",
        "RETREAT",
        "REGROUP",
        "ROUTED",
        "BROKEN",
        "DEFEATED",
      ])
      .default("IDLE"),
    statusRemainingTicks: natural.default(0),
    regroupRemainingTicks: natural.default(0),
    breakImmunityTicks: natural.default(0),
    ticksSinceDamage: natural.default(0),
    cohesionRecoveryRemainder: natural.max(999).default(0),
    moraleRecoveryRemainder: natural.max(999).default(0),
  })
  .transform((s) => ({ ...s, anchor: s.anchor ?? { ...s.position } }));
export type Position = z.infer<typeof positionSchema>;
export type Order = z.infer<typeof orderSchema>;
export const playerSchema = z.strictObject({
  id,
  nationId: id,
  xp: natural.default(0),
  merit: natural.default(0),
  level: natural.min(1).max(40).default(1),
  rank: z
    .enum(["junior", "sima", "xiaowei", "zhonglangjiang", "general"])
    .default("junior"),
  supplyPoints: natural.default(0),
  lastCommandSeq: z
    .number()
    .int()
    .min(-1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(-1),
});
export const commanderSchema = z.strictObject({
  id,
  ownerPlayerId: id,
  assignedSquadId: id.nullable().default(null),
  reassignTargetId: id.nullable().default(null),
  position: positionSchema.default({ x: 0, y: 0 }),
  classId: z.enum(["warrior", "strategist", "commander"]).default("warrior"),
  respawnZoneIndex: natural.nullable().default(null),
  respawnRemainingTicks: natural.default(0),
  hpMilli: natural,
  maxHpMilli: natural.positive(),
  status: z
    .enum(["ACTIVE", "REASSIGNING", "EXPOSED", "WOUNDED"])
    .default("ACTIVE"),
  cooldownTicks: z
    .strictObject({ Q: natural, W: natural, R: natural })
    .default({ Q: 0, W: 0, R: 0 }),
});
export const contactSchema = z.strictObject({
  attackerId: id,
  targetId: id,
  direction: z.enum(["front", "flank", "rear"]).default("front"),
  preparedSpear: z.boolean().default(false),
});
export const scenarioSchema = z.strictObject({
  augmentDefinitions: augmentDefinitionsSchema.default([]),
  players: z.array(playerSchema).default([]),
  squads: z.array(squadSchema).default([]),
  commanders: z.array(commanderSchema).default([]),
  safeZones: z
    .array(
      z.strictObject({
        nationId: id,
        position: positionSchema,
        radiusUnits: natural,
      }),
    )
    .default([]),
});
export type Player = z.infer<typeof playerSchema>;
export type Commander = z.infer<typeof commanderSchema>;
export type Squad = z.infer<typeof squadSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type BattleScenario = z.input<typeof scenarioSchema>;
export const skillEffectSchema = z.strictObject({
  id,
  sourceCommanderId: id,
  sourceCommandSeq: natural,
  skill: z.enum(["W", "R"]),
  targetSquadIds: z.array(id).min(1),
  expiresAt: natural,
  extensionsUsed: natural,
});
export type SkillEffect = z.infer<typeof skillEffectSchema>;
export type Skill = "Q" | "W" | "R";
export interface BattleState {
  augmentDefinitions: AugmentDefinition[];
  augmentProgress: AugmentProgress[];
  augmentEffects: AugmentEffect[];
  augmentProcessedTick: number;
  config: BattleConfig;
  seed: number;
  tick: number;
  players: Player[];
  commanders: Commander[];
  squads: Squad[];
  safeZones: z.infer<typeof scenarioSchema>["safeZones"];
  impactedContacts: string[];
  skillEffects: SkillEffect[];
}
const baseCommand = {
  seq: natural,
  requestedTick: natural,
  squadIds: z.array(id).min(1),
};
export const commandSchema = z.strictObject({
  playerId: id,
  command: z.discriminatedUnion("type", [
    z.strictObject({
      ...baseCommand,
      squadIds: z.array(id).length(0).default([]),
      type: z.literal("SELECT_AUGMENT"),
      checkpoint: natural,
      augmentId: id,
    }),
    z.strictObject({
      ...baseCommand,
      type: z.literal("CAST_SKILL"),
      commanderId: id,
      skill: z.enum(["Q", "W", "R"]),
      targetSquadId: id.optional(),
    }),
    z.strictObject({
      ...baseCommand,
      type: z.literal("REASSIGN_COMMANDER"),
      commanderId: id,
    }),
    z.strictObject({
      ...baseCommand,
      type: z.literal("ATTACK"),
      targetSquadId: id,
    }),
    z.strictObject({
      ...baseCommand,
      type: z.enum(["MOVE", "ATTACK_MOVE", "RETREAT"]),
      destination: positionSchema,
    }),
    z.strictObject({ ...baseCommand, type: z.literal("SET_STANCE"), stance }),
    z.strictObject({
      ...baseCommand,
      type: z.literal("SET_FORMATION"),
      formation,
    }),
  ]),
});
export type BasicCommand = Exclude<
  z.infer<typeof commandSchema>["command"],
  { type: "CAST_SKILL" | "REASSIGN_COMMANDER" | "SELECT_AUGMENT" }
>;
export type BattleInput = z.infer<typeof commandSchema>;
export interface BattleEvent {
  tick: number;
  type:
    | "AUGMENT_OFFERED"
    | "AUGMENT_SELECTED"
    | "AUGMENT_EFFECT_APPLIED"
    | "AUGMENT_EFFECT_EXPIRED"
    | "SKILL_CAST"
    | "SKILL_EFFECT_APPLIED"
    | "SKILL_EFFECT_EXPIRED"
    | "SKILL_EFFECT_EXTENDED"
    | "CHARGE_STARTED"
    | "CHARGE_IMPACT"
    | "CHARGE_CANCELLED"
    | "COMMANDER_REASSIGNING"
    | "COMMANDER_ASSIGNED"
    | "COMMANDER_WOUNDED"
    | "COMMANDER_RESPAWNED"
    | "COMMANDER_HIT"
    | "FSM_CHANGED"
    | "TARGET_ACQUIRED"
    | "FORMATION_COMPLETED"
    | "ORDER_ACCEPTED"
    | "COMMAND_REJECTED"
    | "ATTACK_HIT"
    | "MORALE_CHANGED"
    | "COHESION_CHANGED"
    | "SQUAD_ROUTED"
    | "SQUAD_BROKEN"
    | "SQUAD_RECOVERED"
    | "SQUAD_DEFEATED";
  actorId: string;
  targetId?: string;
  sourceCommandSeq?: number;
  delta?: number;
  reason?: string;
  sourceCommanderId?: string;
  skill?: Skill;
  effectId?: string;
  moraleDelta?: number;
}
export interface StepResult {
  state: BattleState;
  events: BattleEvent[];
}
