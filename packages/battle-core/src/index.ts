export { battleConfigSchema, parseBattleConfig } from "./config.js";
export type { BattleConfig } from "./config.js";
export { createBattle, step } from "./battle.js";
export { applyBp, calculateDamage, livingSoldiers } from "./damage.js";
export { canonicalJson, hashReplayValue, replay } from "./replay.js";
export { visibleSquadIds } from "./visibility.js";
export type {
  Skill,
  SkillEffect,
  Position,
  Order,
  BattleState,
  BattleScenario,
  Player,
  Commander,
  Squad,
  Contact,
  BattleInput,
  BattleEvent,
  StepResult,
} from "./model.js";

export {
  augmentDefinitionSchema,
  augmentDefinitionsSchema,
} from "./augments.js";
export type { AugmentDefinition } from "./augments.js";

export {
  objectiveRulesSchema,
  createObjectiveMatch,
  advanceObjectives,
  finishObjectiveMatch,
} from "./objectives.js";
export type {
  ObjectiveRules,
  ObjectiveMatchState,
  ObjectiveResult,
} from "./objectives.js";
export {
  nationalRulesSchema,
  economyActionSchema,
  createNationalProgress,
  queueSupply,
  advanceNational,
  finishNationalRanking,
} from "./national.js";
export type {
  NationalRules,
  NationalProgress,
  EconomyAction,
} from "./national.js";
export { experimentalAugments } from "./data/experimental-v0.1.js";
