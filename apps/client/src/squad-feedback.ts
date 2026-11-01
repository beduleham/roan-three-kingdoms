export const feedbackPolicy = {
  hitFlashTicks: 2,
  hitTint: 0xffc18c,
  normalTint: 0xffffff,
};
export function squadFeedback(
  s: { hpMilli: number; fsmState: string },
  tick: number,
  lastDamageTick?: number,
) {
  const dead = s.hpMilli === 0;
  const routed = !dead && s.fsmState === "ROUTED",
    broken = !dead && s.fsmState === "BROKEN";
  const hit =
    !dead &&
    lastDamageTick !== undefined &&
    lastDamageTick <= tick &&
    tick - lastDamageTick < feedbackPolicy.hitFlashTicks;
  return {
    state: dead ? "DEFEATED" : s.fsmState,
    attackAllowed: !dead && !routed && !broken && s.fsmState !== "REGROUP",
    alpha: dead ? 0 : broken ? 0.5 : routed ? 0.8 : 1,
    tint: hit
      ? feedbackPolicy.hitTint
      : broken || routed
        ? 0xd0b999
        : feedbackPolicy.normalTint,
    label: dead
      ? "전멸"
      : routed
        ? "패주"
        : broken
          ? "붕괴"
          : hit
            ? "피격"
            : "",
  };
}
