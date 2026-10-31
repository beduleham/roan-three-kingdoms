import { expect, it } from "vitest";
import { describeAugment } from "../src/augment-description.js";
it("uses projected effect, duration and tick size rather than hardcoded candidate IDs", () => {
  expect(
    describeAugment(
      {
        sourceSkill: "Q",
        trigger: "onChargeImpact",
        effect: { stat: "attack", bonusBp: 750 },
        durationTicks: 12,
      },
      100,
    ),
  ).toBe("Q 충돌 성공 후 · 공격 7.5% · 1.2초");
  expect(
    describeAugment(
      {
        sourceSkill: "W",
        trigger: "onSkillCast",
        effect: { stat: "cohesionDamageReduction", bonusBp: 2000 },
        durationTicks: 30,
      },
      200,
    ),
  ).toBe("W 시전 후 · 전열 피해 감소 20% · 6초");
});
