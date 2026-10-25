import type { AugmentDefinition } from "../../src/augments.js";
// Synthetic fixtures only. Not the named game content.
export const syntheticAugments: AugmentDefinition[] = [
  {
    id: "test-charge",
    category: "synthetic",
    minLevel: 5,
    trigger: "onChargeImpact",
    eligibility: { unitTypes: ["cavalry"] },
    effect: { stat: "attack", bonusBp: 1000 },
    durationTicks: 3,
    stackingPolicy: { mode: "stack", maxStacks: 2, capBp: 1500 },
  },
  {
    id: "test-cast",
    category: "synthetic",
    minLevel: 5,
    trigger: "onSkillCast",
    eligibility: { unitTypes: ["cavalry"] },
    effect: { stat: "speed", bonusBp: 500 },
    durationTicks: 2,
    stackingPolicy: { mode: "refresh", maxStacks: 1, capBp: 500 },
  },
  {
    id: "test-break",
    category: "synthetic",
    minLevel: 5,
    trigger: "onCohesionBroken",
    eligibility: { unitTypes: ["cavalry"] },
    effect: { stat: "attack", bonusBp: 200 },
    durationTicks: 2,
    stackingPolicy: { mode: "ignore", maxStacks: 1, capBp: 200 },
  },
];
