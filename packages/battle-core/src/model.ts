import { z } from "zod";
import type { BattleConfig } from "./config.js";

export const natural = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1);
const percent = natural.max(100);
export const squadSchema = z.strictObject({
  id,
  ownerPlayerId: id,
  nationId: id,
  unitType: z.enum(["infantry", "spears", "archers", "cavalry"]),
  position: z
    .strictObject({ x: z.number().int().safe(), y: z.number().int().safe() })
    .default({ x: 0, y: 0 }),
  maxSoldiers: natural.positive(),
  hpMilli: natural,
  morale: percent.default(100),
  cohesion: percent.default(100),
  formation: z.enum(["normal", "defense", "offense"]).default("normal"),
  fsmState: z.enum(["IDLE", "ROUTED", "BROKEN", "DEFEATED"]).default("IDLE"),
  statusRemainingTicks: natural.default(0),
  breakImmunityTicks: natural.default(0),
  safe: z.boolean().default(false),
  ticksSinceDamage: natural.default(0),
  cohesionRecoveryRemainder: natural.max(999).default(0),
  moraleRecoveryRemainder: natural.max(999).default(0),
});
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
  hpMilli: natural,
  maxHpMilli: natural.positive(),
  status: z.enum(["ACTIVE", "WOUNDED"]).default("ACTIVE"),
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
  players: z.array(playerSchema).default([]),
  squads: z.array(squadSchema).default([]),
  commanders: z.array(commanderSchema).default([]),
  contacts: z.array(contactSchema).default([]),
});
export type Player = z.infer<typeof playerSchema>;
export type Commander = z.infer<typeof commanderSchema>;
export type Squad = z.infer<typeof squadSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type BattleScenario = z.input<typeof scenarioSchema>;
export interface BattleState {
  config: BattleConfig;
  seed: number;
  tick: number;
  players: Player[];
  commanders: Commander[];
  squads: Squad[];
  contacts: Contact[];
  impactedContacts: string[];
}
export const commandSchema = z.strictObject({
  playerId: id,
  command: z.strictObject({
    type: z.literal("ATTACK"),
    seq: natural,
    requestedTick: natural,
    squadIds: z.array(id).min(1),
    targetSquadId: id,
  }),
});
export type BattleInput = z.infer<typeof commandSchema>;
export interface BattleEvent {
  tick: number;
  type:
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
}
export interface StepResult {
  state: BattleState;
  events: BattleEvent[];
}
