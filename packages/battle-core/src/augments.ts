import { augmentPolicy } from "./augment-policy.js";
import { canonicalJson } from "./canonical.js";
import { z } from "zod";
import type { BattleState, BattleEvent, Squad } from "./model.js";
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const augmentDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  category: z.string().min(1),
  minLevel: integer.min(1).max(40),
  trigger: z.enum(["onChargeImpact", "onSkillCast", "onCohesionBroken"]),
  eligibility: z.strictObject({
    unitTypes: z
      .array(z.enum(["infantry", "spears", "archers", "cavalry"]))
      .min(1),
  }),
  effect: z.strictObject({
    stat: z.enum(["attack", "speed"]),
    bonusBp: integer.max(augmentPolicy.maxBonusBp),
  }),
  durationTicks: integer.positive(),
  stackingPolicy: z.strictObject({
    mode: z.enum(["refresh", "stack", "ignore"]),
    maxStacks: integer.min(1).max(augmentPolicy.maxStacks),
    capBp: integer.max(augmentPolicy.maxBonusBp),
  }),
});
export const augmentDefinitionsSchema = z
  .array(augmentDefinitionSchema)
  .superRefine((defs, ctx) => {
    if (new Set(defs.map((d) => d.id)).size !== defs.length)
      ctx.addIssue({ code: "custom", message: "Duplicate augment ID" });
  });
export type AugmentDefinition = z.infer<typeof augmentDefinitionSchema>;
export interface AugmentProgress {
  playerId: string;
  earned: number[];
  selected: string[];
  spent: number;
  offer: { checkpoint: number; candidates: string[] } | null;
}
export interface AugmentEffect {
  playerId: string;
  augmentId: string;
  squadId: string;
  expiresAt: number;
  stacks: number;
}
type Emit = (event: Omit<BattleEvent, "tick">) => void;
export function offerAugments(state: BattleState, emit: Emit): void {
  for (const p of state.players) {
    let progress = state.augmentProgress.find((a) => a.playerId === p.id);
    if (!progress) {
      progress = {
        playerId: p.id,
        earned: [],
        selected: [],
        spent: 0,
        offer: null,
      };
      state.augmentProgress.push(progress);
    }
    progress.earned = state.config.augmentLevels.filter(
      (level) => level <= p.level,
    );
    if (progress.offer || progress.spent >= progress.earned.length) continue;
    const candidates = state.augmentDefinitions
      .filter((d) => d.minLevel <= p.level && !progress.selected.includes(d.id))
      .map((d) => d.id)
      .sort()
      .slice(0, augmentPolicy.candidateCount);
    if (candidates.length < augmentPolicy.candidateCount) continue;
    progress.offer = {
      checkpoint: progress.earned[progress.spent]!,
      candidates,
    };
    emit({
      type: "AUGMENT_OFFERED",
      actorId: p.id,
      reason: JSON.stringify(progress.offer),
    });
  }
}
export function selectAugment(
  state: BattleState,
  playerId: string,
  checkpoint: number,
  id: string,
): string | undefined {
  const p = state.players.find((p) => p.id === playerId),
    progress = state.augmentProgress.find((p) => p.playerId === playerId);
  if (
    !p ||
    !progress?.offer ||
    progress.spent >=
      state.config.augmentLevels.filter((l) => l <= p.level).length
  )
    return "NO_OPPORTUNITY";
  if (
    progress.offer.checkpoint !== checkpoint ||
    !progress.offer.candidates.includes(id)
  )
    return "NOT_OFFERED";
  const definition = state.augmentDefinitions.find((d) => d.id === id);
  if (
    !definition ||
    definition.minLevel > p.level ||
    progress.selected.includes(id)
  )
    return "INELIGIBLE";
  return;
}
export function expireAugments(state: BattleState, emit: Emit): void {
  state.augmentEffects = state.augmentEffects.filter((e) => {
    if (e.expiresAt > state.tick) return true;
    emit({
      type: "AUGMENT_EFFECT_EXPIRED",
      actorId: e.playerId,
      targetId: e.squadId,
      effectId: e.augmentId,
    });
    return false;
  });
}
export function processAugmentEvents(
  state: BattleState,
  events: readonly BattleEvent[],
  emit: Emit,
): void {
  // Only the fixed base-event snapshot is inspected. Generated events cannot recursively trigger.
  if (state.augmentProcessedTick === state.tick) return;
  state.augmentProcessedTick = state.tick;
  const triggerMap = {
    CHARGE_IMPACT: "onChargeImpact",
    SKILL_CAST: "onSkillCast",
    SQUAD_BROKEN: "onCohesionBroken",
  } as const;
  const seen = new Set<string>();
  events.forEach((event, index) => {
    const key = canonicalJson(event);
    if (seen.has(key)) return;
    seen.add(key);
    const trigger = triggerMap[event.type as keyof typeof triggerMap];
    if (!trigger) return;
    const actor = state.squads.find((s) => s.id === event.actorId);
    const owner =
      trigger === "onSkillCast"
        ? state.commanders.find((c) => c.id === event.actorId)?.ownerPlayerId
        : actor?.ownerPlayerId;
    const progress = state.augmentProgress.find((p) => p.playerId === owner);
    if (!progress) return;
    for (const id of [...progress.selected].sort()) {
      const selectionIndex = events.findIndex(
        (e) =>
          e.type === "AUGMENT_SELECTED" &&
          e.actorId === owner &&
          e.effectId === id,
      );
      if (selectionIndex >= index) continue;
      const d = state.augmentDefinitions.find((d) => d.id === id)!;
      if (d.trigger !== trigger) continue;
      for (const squad of state.squads.filter(
        (s) =>
          s.ownerPlayerId === owner &&
          s.hpMilli > 0 &&
          d.eligibility.unitTypes.includes(s.unitType) &&
          (trigger === "onSkillCast" || s.id === actor?.id),
      )) {
        let effect = state.augmentEffects.find(
          (e) =>
            e.playerId === owner &&
            e.augmentId === id &&
            e.squadId === squad.id,
        );
        if (effect && d.stackingPolicy.mode === "ignore") continue;
        const expiresAt = state.tick + 1 + d.durationTicks;
        if (!Number.isSafeInteger(expiresAt))
          throw new Error("Unsafe augment duration");
        if (!effect) {
          effect = {
            playerId: owner!,
            augmentId: id,
            squadId: squad.id,
            expiresAt,
            stacks: 1,
          };
          state.augmentEffects.push(effect);
        } else {
          effect.stacks =
            d.stackingPolicy.mode === "stack"
              ? Math.min(d.stackingPolicy.maxStacks, effect.stacks + 1)
              : 1;
          effect.expiresAt = expiresAt;
        }
        emit({
          type: "AUGMENT_EFFECT_APPLIED",
          actorId: owner!,
          targetId: squad.id,
          effectId: id,
          reason: JSON.stringify([state.tick, index]),
        });
      }
    }
  });
}
export function augmentBonus(
  state: BattleState,
  squad: Squad,
  stat: "attack" | "speed",
): number {
  let sum = 0;
  for (const e of state.augmentEffects) {
    if (e.squadId !== squad.id || e.expiresAt <= state.tick) continue;
    const d = state.augmentDefinitions.find((d) => d.id === e.augmentId)!;
    if (d.effect.stat === stat)
      sum += Math.min(d.stackingPolicy.capBp, d.effect.bonusBp * e.stacks);
  }
  return Math.min(augmentPolicy.maxBonusBp, sum);
}
