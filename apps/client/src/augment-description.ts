export interface AugmentDescription {
  sourceSkill?: string;
  trigger: string;
  effect: { stat: string; bonusBp: number };
  durationTicks: number;
}
/** Render trusted projected content, independent of implementation IDs. */
export function describeAugment(detail: AugmentDescription, tickMs: number) {
  const effect =
    detail.effect.stat === "attack"
      ? "공격"
      : detail.effect.stat === "speed"
        ? "이동 속도"
        : "전열 피해 감소";
  const trigger =
    detail.trigger === "onChargeImpact" ? "충돌 성공 후" : "시전 후";
  return `${detail.sourceSkill ?? ""} ${trigger} · ${effect} ${detail.effect.bonusBp / 100}% · ${(detail.durationTicks * tickMs) / 1000}초`;
}
