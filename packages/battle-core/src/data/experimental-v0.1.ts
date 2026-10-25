import type { AugmentDefinition } from "../augments.js";
// Opt-in scenario data only. No core default import. Values are NOT balance validated.
export const experimentalVersion = "experimental-v0.1";
const common = {
  version: experimentalVersion,
  designStatus: "experimental-not-balance-validated",
  minLevel: 5,
  endOnDisabled: true,
} as const;
export const experimentalAugments: AugmentDefinition[] = [
  {
    ...common,
    id: "draft-shock-breakthrough",
    category: "warrior-offense",
    trigger: "onChargeImpact",
    sourceSkill: "Q",
    eligibility: { unitTypes: ["infantry", "spears", "cavalry"] },
    effect: { stat: "attack", bonusBp: 1500 },
    durationTicks: 30,
    stackingPolicy: { mode: "refresh", maxStacks: 1, capBp: 1500 },
  },
  {
    ...common,
    id: "draft-gale-maneuver",
    category: "warrior-mobility",
    trigger: "onChargeImpact",
    sourceSkill: "Q",
    eligibility: { unitTypes: ["infantry", "spears", "cavalry"] },
    effect: { stat: "speed", bonusBp: 1000 },
    durationTicks: 30,
    stackingPolicy: { mode: "ignore", maxStacks: 1, capBp: 1000 },
  },
  {
    ...common,
    id: "draft-legion-discipline",
    category: "warrior-support",
    trigger: "onSkillCast",
    sourceSkill: "W",
    targetPolicy: "cast-targets",
    eligibility: { unitTypes: ["infantry", "spears", "cavalry", "archers"] },
    effect: { stat: "cohesionDamageReduction", bonusBp: 2000 },
    durationTicks: 60,
    stackingPolicy: { mode: "refresh", maxStacks: 1, capBp: 2000 },
  },
];
