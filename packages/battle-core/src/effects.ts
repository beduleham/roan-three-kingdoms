import { augmentBonus } from "./augments.js";
import type { BattleState, Commander, Squad } from "./model.js";

export function commanderEnabled(c: Commander, state: BattleState): boolean {
  const host = state.squads.find((s) => s.id === c.assignedSquadId);
  return (
    c.hpMilli > 0 &&
    c.status === "ACTIVE" &&
    !!host &&
    host.hpMilli > 0 &&
    host.fsmState !== "ROUTED" &&
    host.fsmState !== "BROKEN"
  );
}
export function skillMultiplier(
  state: BattleState,
  squad: Squad,
  kind: "attack" | "speed" | "impact",
): number {
  let bp: number = state.config.modifierBasisPoints;
  for (const effect of state.skillEffects) {
    const source = state.commanders.find(
      (c) => c.id === effect.sourceCommanderId,
    );
    if (
      effect.expiresAt <= state.tick ||
      !effect.targetSquadIds.includes(squad.id) ||
      !source ||
      !commanderEnabled(source, state)
    )
      continue;
    const bonus =
      kind === "attack" && effect.skill === "W"
        ? state.config.warriorSkills.W.attackBonusBp
        : kind === "speed" && effect.skill === "R"
          ? state.config.warriorSkills.R.speedBonusBp
          : kind === "impact" && effect.skill === "R"
            ? state.config.warriorSkills.R.chargeImpactBonusBp
            : bp;
    bp = Math.max(bp, bonus);
  }
  return kind === "impact" ? bp : bp + augmentBonus(state, squad, kind);
}
