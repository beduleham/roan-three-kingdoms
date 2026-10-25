import type {
  BattleEvent,
  BattleInput,
  BattleState,
  Commander,
  Position,
  Squad,
} from "./model.js";
import { commanderEnabled, skillMultiplier } from "./effects.js";
import { applyBp, livingSoldiers, safeInteger } from "./damage.js";
import {
  directionFrom,
  distanceSquared,
  forced,
  moveTowards,
  speedUnits,
  within,
} from "./spatial.js";

export type Emit = (event: Omit<BattleEvent, "tick">) => void;
export type WarriorCommand = Extract<
  BattleInput["command"],
  { type: "CAST_SKILL" | "REASSIGN_COMMANDER" }
>;
export type DamageDelta = { hp: bigint; morale: number; cohesion: number };
export const emptyDelta = (): DamageDelta => ({
  hp: 0n,
  morale: 0,
  cohesion: 0,
});
const castId = (commanderId: string, skill: string, seq: number) =>
  JSON.stringify([commanderId, skill, seq]);

export function initializeCommanders(state: BattleState): void {
  for (const c of state.commanders) {
    const host = state.squads.find((s) => s.id === c.assignedSquadId);
    if (c.hpMilli === 0) {
      c.status = "WOUNDED";
      c.assignedSquadId = null;
      c.reassignTargetId = null;
      c.respawnRemainingTicks = state.config.commander.woundedRespawnTicks;
    } else if (c.status === "ACTIVE" && host?.hpMilli)
      c.position = { ...host.position };
    else if (c.status === "ACTIVE") {
      c.status = "EXPOSED";
      c.assignedSquadId = null;
    }
  }
}
export function cancelCharge(s: Squad, emit: Emit, reason: string): void {
  if (!s.charge) return;
  emit({
    type: "CHARGE_CANCELLED",
    actorId: s.id,
    targetId: s.charge.targetSquadId,
    sourceCommanderId: s.charge.sourceCommanderId,
    sourceCommandSeq: s.charge.sourceCommandSeq,
    skill: "Q",
    reason,
  });
  s.charge = null;
  s.order = null;
  s.currentTargetId = null;
  if (!forced(s)) {
    s.fsmState = "IDLE";
    s.anchor = { ...s.position };
  }
}
export function pruneEffects(state: BattleState, emit: Emit): void {
  state.skillEffects = state.skillEffects.filter((effect) => {
    const source = state.commanders.find(
      (c) => c.id === effect.sourceCommanderId,
    );
    const active =
      effect.expiresAt > state.tick &&
      !!source &&
      commanderEnabled(source, state);
    if (!active)
      emit({
        type: "SKILL_EFFECT_EXPIRED",
        actorId: effect.sourceCommanderId,
        sourceCommanderId: effect.sourceCommanderId,
        sourceCommandSeq: effect.sourceCommandSeq,
        skill: effect.skill,
        effectId: effect.id,
        reason: effect.expiresAt <= state.tick ? "DURATION" : "SOURCE_DISABLED",
      });
    return active;
  });
  for (const s of state.squads) {
    const charge = s.charge;
    if (!charge) continue;
    const source = state.commanders.find(
      (c) => c.id === charge.sourceCommanderId,
    );
    if (forced(s) || !source || !commanderEnabled(source, state))
      cancelCharge(s, emit, "SOURCE_OR_SQUAD_DISABLED");
    else if (charge.expiresAt <= state.tick) cancelCharge(s, emit, "DURATION");
  }
}
export function beginWarriorTick(state: BattleState, emit: Emit): void {
  for (const c of state.commanders) {
    for (const key of ["Q", "W", "R"] as const)
      c.cooldownTicks[key] = Math.max(0, c.cooldownTicks[key] - 1);
    if (c.status === "WOUNDED") {
      c.respawnRemainingTicks = Math.max(0, c.respawnRemainingTicks - 1);
      const zone =
        c.respawnZoneIndex === null
          ? undefined
          : state.safeZones[c.respawnZoneIndex];
      if (c.respawnRemainingTicks === 0 && zone) {
        c.hpMilli = c.maxHpMilli;
        c.position = { ...zone.position };
        c.status = "EXPOSED";
        c.assignedSquadId = null;
        c.reassignTargetId = null;
        emit({ type: "COMMANDER_RESPAWNED", actorId: c.id });
      }
    }
  }
  pruneEffects(state, emit);
}
export function synchronizeCommanders(state: BattleState, emit: Emit): void {
  for (const c of state.commanders) {
    if (c.status === "WOUNDED") continue;
    if (c.status === "REASSIGNING") {
      const target = state.squads.find(
        (s) => s.id === c.reassignTargetId && s.hpMilli > 0,
      );
      if (!target) {
        c.status = "EXPOSED";
        c.reassignTargetId = null;
        continue;
      }
      c.position = moveTowards(
        c.position,
        target.position,
        state.config.warriorAssumptions.commanderMoveUnitsPerTick,
      );
      if (distanceSquared(c.position, target.position) === 0n) {
        c.status = "ACTIVE";
        c.assignedSquadId = target.id;
        c.reassignTargetId = null;
        emit({
          type: "COMMANDER_ASSIGNED",
          actorId: c.id,
          targetId: target.id,
        });
      }
    } else if (c.status === "ACTIVE") {
      const host = state.squads.find(
        (s) => s.id === c.assignedSquadId && s.hpMilli > 0,
      );
      if (host) c.position = { ...host.position };
      else {
        c.status = "EXPOSED";
        c.assignedSquadId = null;
      }
    }
  }
}
export function validateWarriorCommand(
  state: BattleState,
  playerId: string,
  cmd: WarriorCommand,
): string | undefined {
  const c = state.commanders.find((c) => c.id === cmd.commanderId);
  if (!c || c.ownerPlayerId !== playerId) return "NOT_OWNER";
  if (c.status === "WOUNDED" || c.hpMilli === 0) return "COMMANDER_WOUNDED";
  const targets = cmd.squadIds.map((id) =>
    state.squads.find((s) => s.id === id),
  );
  if (targets.some((s) => !s || s.hpMilli === 0)) return "INVALID_TARGET";
  if (cmd.type === "REASSIGN_COMMANDER") {
    if (targets.length !== 1) return "TARGET_LIMIT";
    if (targets[0]!.ownerPlayerId !== playerId) return "NOT_OWNER";
    return;
  }
  if (c.classId !== "warrior") return "WRONG_CLASS";
  if (!commanderEnabled(c, state)) return "COMMANDER_DISABLED";
  if (c.cooldownTicks[cmd.skill] > 0) return "COOLDOWN";
  const player = state.players.find((p) => p.id === playerId)!;
  if (cmd.skill === "R" && player.level < state.config.warriorSkills.R.minLevel)
    return "LEVEL_REQUIRED";
  const limit =
    cmd.skill === "Q"
      ? 1
      : state.config.warriorSkills[cmd.skill].targetSquadLimit;
  if (targets.length > limit) return "TARGET_LIMIT";
  if (
    targets.some((s) =>
      cmd.skill === "W"
        ? s!.nationId !== player.nationId
        : s!.ownerPlayerId !== playerId,
    )
  )
    return "NOT_OWNER";
  if (targets.some((s) => forced(s!))) return "FORCED_STATE";
  if (cmd.skill !== "W" && targets.some((s) => s!.unitType === "archers"))
    return "MELEE_REQUIRED";
  const radius =
    state.config.commander.commandRadiusTiles *
    state.config.positionUnitsPerTile;
  if (!Number.isSafeInteger(radius)) throw new Error("Unsafe command radius");
  if (targets.some((s) => !within(c.position, s!.position, radius)))
    return "OUT_OF_COMMAND_RANGE";
  if (cmd.skill === "Q") {
    const s = targets[0]!,
      target = state.squads.find((s) => s.id === cmd.targetSquadId);
    if (!target || target.hpMilli === 0 || target.nationId === player.nationId)
      return "INVALID_TARGET";
    const rules = state.config.warriorAssumptions;
    const min = rules.chargePreparationUnits + rules.chargeCollisionRadiusUnits;
    if (distanceSquared(s.position, target.position) < BigInt(min) ** 2n)
      return "INSUFFICIENT_PREPARATION";
    if (!within(s.position, target.position, rules.chargeMaxTravelUnits))
      return "CHARGE_TOO_FAR";
    if (directionFrom(s, target) !== "front") return "INVALID_CHARGE_DIRECTION";
    if (s.charge) return "ALREADY_CHARGING";
  } else if (cmd.targetSquadId !== undefined) return "INVALID_TARGET";
}
export function acceptWarriorCommand(
  state: BattleState,
  cmd: WarriorCommand,
  emit: Emit,
): void {
  const c = state.commanders.find((c) => c.id === cmd.commanderId)!;
  const targets = cmd.squadIds.map((id) =>
    state.squads.find((s) => s.id === id)!,
  );
  if (cmd.type === "REASSIGN_COMMANDER") {
    c.status = "REASSIGNING";
    c.assignedSquadId = null;
    c.reassignTargetId = targets[0]!.id;
    emit({
      type: "COMMANDER_REASSIGNING",
      actorId: c.id,
      targetId: c.reassignTargetId,
      sourceCommandSeq: cmd.seq,
    });
    pruneEffects(state, emit);
    return;
  }
  c.cooldownTicks[cmd.skill] =
    state.config.warriorSkills[cmd.skill].cooldownTicks;
  emit({
    type: "SKILL_CAST",
    targetSquadIds: targets.map((s) => s.id),
    actorId: c.id,
    sourceCommanderId: c.id,
    skill: cmd.skill,
    sourceCommandSeq: cmd.seq,
    effectId: castId(c.id, cmd.skill, cmd.seq),
  });
  if (cmd.skill === "Q") {
    const s = targets[0]!,
      target = state.squads.find((s) => s.id === cmd.targetSquadId)!;
    s.order = null;
    s.currentTargetId = target.id;
    s.regroupRemainingTicks = 0;
    s.fsmState = "CHARGE";
    s.anchor = { ...s.position };
    s.charge = {
      sourceCommanderId: c.id,
      sourceCommandSeq: cmd.seq,
      targetSquadId: target.id,
      start: { ...s.position },
      destination: { ...target.position },
      expiresAt: safeInteger(
        BigInt(state.tick) +
          BigInt(state.config.warriorAssumptions.chargeMaxDurationTicks),
      ),
    };
    emit({
      type: "CHARGE_STARTED",
      actorId: s.id,
      targetId: target.id,
      sourceCommanderId: c.id,
      sourceCommandSeq: cmd.seq,
      skill: "Q",
    });
    return;
  }
  const skill = cmd.skill,
    settings = state.config.warriorSkills[skill];
  const alreadyRallied = new Set(
    state.skillEffects
      .filter((e) => e.skill === "W" && e.expiresAt > state.tick)
      .flatMap((e) => e.targetSquadIds),
  );
  for (const old of state.skillEffects.filter(
    (e) => e.sourceCommanderId === c.id && e.skill === skill,
  ))
    emit({
      type: "SKILL_EFFECT_EXPIRED",
      actorId: c.id,
      skill,
      effectId: old.id,
      reason: "REFRESHED",
    });
  state.skillEffects = state.skillEffects.filter(
    (e) => e.sourceCommanderId !== c.id || e.skill !== skill,
  );
  const effect = {
    id: castId(c.id, skill, cmd.seq),
    sourceCommanderId: c.id,
    sourceCommandSeq: cmd.seq,
    skill,
    targetSquadIds: targets.map((s) => s.id),
    expiresAt: safeInteger(BigInt(state.tick) + BigInt(settings.durationTicks)),
    extensionsUsed: 0,
  };
  state.skillEffects.push(effect);
  for (const s of targets) {
    if (skill === "W" && !alreadyRallied.has(s.id)) {
      const delta = Math.min(
        100 - s.morale,
        state.config.warriorSkills.W.moraleRestore,
      );
      s.morale += delta;
      if (delta)
        emit({
          type: "MORALE_CHANGED",
          actorId: s.id,
          delta,
          sourceCommanderId: c.id,
          sourceCommandSeq: cmd.seq,
          skill,
        });
    }
    emit({
      type: "SKILL_EFFECT_APPLIED",
      actorId: c.id,
      targetId: s.id,
      sourceCommanderId: c.id,
      sourceCommandSeq: cmd.seq,
      skill,
      effectId: effect.id,
    });
  }
}
export function advanceCharge(
  s: Squad,
  snapshot: BattleState,
  state: BattleState,
): void {
  const charge = s.charge!;
  const target = snapshot.squads.find((t) => t.id === charge.targetSquadId);
  if (!target || target.hpMilli === 0) return; // resolved with an event after all movement
  const before = s.position;
  s.position = moveTowards(
    before,
    charge.destination,
    speedUnits(s, state.config, skillMultiplier(state, s, "speed")),
  );
  if (distanceSquared(before, s.position) > 0n)
    s.facing = { x: s.position.x - before.x, y: s.position.y - before.y };
  s.fsmState = "CHARGE";
}
function closestCollision(
  a0: Position,
  a1: Position,
  b0: Position,
  b1: Position,
  radius: number,
): { num: bigint; den: bigint } | null {
  const rx = BigInt(a0.x) - BigInt(b0.x),
    ry = BigInt(a0.y) - BigInt(b0.y);
  const vx = BigInt(a1.x) - BigInt(b1.x) - rx,
    vy = BigInt(a1.y) - BigInt(b1.y) - ry;
  const den = vx * vx + vy * vy;
  if (den === 0n)
    return rx * rx + ry * ry <= BigInt(radius) ** 2n
      ? { num: 0n, den: 1n }
      : null;
  const raw = -(rx * vx + ry * vy),
    num = raw < 0n ? 0n : raw > den ? den : raw;
  const x = rx * den + vx * num,
    y = ry * den + vy * num;
  return x * x + y * y <= BigInt(radius) ** 2n * den * den
    ? { num, den }
    : null;
}
export function resolveCharges(
  state: BattleState,
  before: Map<string, Position>,
  emit: Emit,
) {
  const deltas = new Map<string, DamageDelta>();
  const moraleSources = new Map<string, Set<string>>();
  const rules = state.config.warriorAssumptions;
  // Evaluate all impacts first; status transitions are applied by the battle pipeline.
  for (const s of state.squads) {
    const charge = s.charge;
    if (!charge) continue;
    const source = state.commanders.find(
      (c) => c.id === charge.sourceCommanderId,
    );
    const target = state.squads.find((t) => t.id === charge.targetSquadId);
    if (
      !source ||
      !commanderEnabled(source, state) ||
      forced(s) ||
      !target ||
      target.hpMilli === 0
    ) {
      cancelCharge(s, emit, "INVALIDATED");
      continue;
    }
    const from = before.get(s.id)!,
      targetFrom = before.get(target.id)!;
    const dx = BigInt(charge.destination.x) - BigInt(charge.start.x),
      dy = BigInt(charge.destination.y) - BigInt(charge.start.y);
    const px = BigInt(s.position.x) - BigInt(charge.start.x),
      py = BigInt(s.position.y) - BigInt(charge.start.y);
    const cross = px * dy - py * dx;
    if (
      cross * cross >
        BigInt(rules.chargePathToleranceUnits) ** 2n * (dx * dx + dy * dy) ||
      px * dx + py * dy < 0n
    ) {
      cancelCharge(s, emit, "INVALID_PATH");
      continue;
    }
    const collision = closestCollision(
      from,
      s.position,
      targetFrom,
      target.position,
      rules.chargeCollisionRadiusUnits,
    );
    const obstructed = state.squads.some((other) => {
      if (
        other.nationId === s.nationId ||
        other.id === target.id ||
        other.hpMilli === 0
      )
        return false;
      const hit = closestCollision(
        from,
        s.position,
        before.get(other.id)!,
        other.position,
        rules.chargeCollisionRadiusUnits,
      );
      return (
        hit &&
        (!collision || hit.num * collision.den <= collision.num * hit.den)
      );
    });
    if (obstructed) {
      cancelCharge(s, emit, "BLOCKED_BY_ENEMY");
      continue;
    }
    if (collision && distanceSquared(from, s.position) > 0n) {
      const { num, den } = collision;
      const x =
        (BigInt(from.x) - BigInt(charge.start.x)) * den +
        (BigInt(s.position.x) - BigInt(from.x)) * num;
      const y =
        (BigInt(from.y) - BigInt(charge.start.y)) * den +
        (BigInt(s.position.y) - BigInt(from.y)) * num;
      if (
        x * x + y * y <
        BigInt(rules.chargePreparationUnits) ** 2n * den * den
      ) {
        cancelCharge(s, emit, "INSUFFICIENT_RUNUP");
        continue;
      }
      const bp = skillMultiplier(state, s, "impact");
      const cohesion = applyBp(state.config.warriorSkills.Q.cohesionDamage, bp);
      const morale = applyBp(state.config.warriorSkills.Q.moraleDamage, bp);
      const delta = deltas.get(target.id) ?? emptyDelta();
      delta.cohesion += cohesion;
      delta.morale += morale;
      deltas.set(target.id, delta);
      const sources = moraleSources.get(target.id) ?? new Set<string>();
      sources.add(s.id);
      moraleSources.set(target.id, sources);
      emit({
        type: "CHARGE_IMPACT",
        actorId: s.id,
        targetId: target.id,
        sourceCommanderId: source.id,
        sourceCommandSeq: charge.sourceCommandSeq,
        skill: "Q",
        delta: -cohesion,
        moraleDelta: -morale,
        effectId: castId(source.id, "Q", charge.sourceCommandSeq),
      });
      s.charge = null;
      s.fsmState = "IDLE";
      s.currentTargetId = null;
      s.order = {
        type: "ATTACK",
        targetSquadId: target.id,
        seq: charge.sourceCommandSeq,
      };
      s.anchor = { ...s.position };
    } else if (distanceSquared(s.position, charge.destination) === 0n)
      cancelCharge(s, emit, "MISSED");
  }
  return { deltas, moraleSources };
}
export function splitCommanderDamage(
  state: BattleState,
  deltas: Map<string, DamageDelta>,
): Map<string, number> {
  const result = new Map<string, number>(),
    rules = state.config.warriorAssumptions;
  for (const c of state.commanders) {
    if (c.status !== "ACTIVE" || c.hpMilli === 0) continue;
    const host = state.squads.find((s) => s.id === c.assignedSquadId),
      delta = host ? deltas.get(host.id) : undefined;
    if (!host || !delta || delta.hp === 0n) continue;
    const soldiers = livingSoldiers(host, state.config);
    const protectedHost =
      BigInt(soldiers) * 100n >=
        BigInt(host.maxSoldiers) * BigInt(rules.protectedSoldiersPercent) &&
      host.cohesion >= rules.protectedCohesionMin &&
      !forced(host);
    const weakened =
      BigInt(soldiers) * 100n >=
        BigInt(host.maxSoldiers) * BigInt(rules.weakenedSoldiersPercent) &&
      host.fsmState !== "BROKEN";
    const bp = protectedHost
      ? rules.protectedDamageShareBp
      : weakened
        ? rules.weakenedDamageShareBp
        : rules.exposedDamageShareBp;
    const effective = Number(
      delta.hp > BigInt(host.hpMilli) ? BigInt(host.hpMilli) : delta.hp,
    );
    const share = Math.min(c.hpMilli, applyBp(effective, bp));
    delta.hp -= BigInt(share);
    result.set(c.id, share);
  }
  return result;
}
export function finishWarriorTick(
  state: BattleState,
  commanderDamage: Map<string, number>,
  routed: Set<string>,
  moraleSources: Map<string, Set<string>>,
  emit: Emit,
): void {
  for (const effect of state.skillEffects) {
    if (
      effect.skill !== "R" ||
      effect.extensionsUsed >= state.config.warriorSkills.R.maxRoutExtensions ||
      effect.expiresAt <= state.tick
    )
      continue;
    const caused = [...routed].find((id) =>
      effect.targetSquadIds.some((s) => moraleSources.get(id)?.has(s)),
    );
    if (caused) {
      effect.extensionsUsed++;
      effect.expiresAt = safeInteger(
        BigInt(effect.expiresAt) +
          BigInt(state.config.warriorSkills.R.routExtensionTicks),
      );
      emit({
        type: "SKILL_EFFECT_EXTENDED",
        actorId: effect.sourceCommanderId,
        targetId: caused,
        sourceCommanderId: effect.sourceCommanderId,
        sourceCommandSeq: effect.sourceCommandSeq,
        skill: "R",
        effectId: effect.id,
        delta: state.config.warriorSkills.R.routExtensionTicks,
      });
    }
  }
  for (const c of state.commanders) {
    const damage = commanderDamage.get(c.id) ?? 0;
    if (damage) {
      c.hpMilli = Math.max(0, c.hpMilli - damage);
      emit({ type: "COMMANDER_HIT", actorId: c.id, delta: -damage });
    }
    if (c.hpMilli === 0 && c.status !== "WOUNDED") {
      c.status = "WOUNDED";
      c.assignedSquadId = null;
      c.reassignTargetId = null;
      c.respawnRemainingTicks = state.config.commander.woundedRespawnTicks;
      emit({ type: "COMMANDER_WOUNDED", actorId: c.id });
    } else if (
      c.status === "ACTIVE" &&
      !state.squads.some((s) => s.id === c.assignedSquadId && s.hpMilli > 0)
    ) {
      c.status = "EXPOSED";
      c.assignedSquadId = null;
    }
  }
  pruneEffects(state, emit);
}
