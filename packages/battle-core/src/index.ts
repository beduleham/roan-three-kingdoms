export { battleConfigSchema, parseBattleConfig } from "./config.js";
export type { BattleConfig } from "./config.js";
export { createBattle, step } from "./battle.js";
export { applyBp, calculateDamage, livingSoldiers } from "./damage.js";
export { canonicalJson, hashReplayValue, replay } from "./replay.js";
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
