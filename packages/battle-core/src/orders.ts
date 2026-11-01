import { seededChoiceKey } from "./seeded-choice.js";
import type { BasicCommand, BattleState, Squad } from "./model.js";
import { advanceCharge } from "./warrior.js";
import { skillMultiplier } from "./effects.js";
import { visibleSquadIds } from "./visibility.js";
import {
  chaseRadius,
  compareIds,
  distanceSquared,
  forced,
  moveTowards,
  rangeUnits,
  speedUnits,
  within,
} from "./spatial.js";

export function acceptOrder(
  s: Squad,
  cmd: BasicCommand,
  state: BattleState,
): void {
  if (cmd.type === "SET_STANCE") {
    s.stance = cmd.stance;
  } else if (cmd.type === "SET_FORMATION") {
    // Repeated requests for the same formation cannot reset the countdown.
    if (
      cmd.formation !== s.pendingFormation &&
      (cmd.formation !== s.formation || s.pendingFormation !== null)
    ) {
      s.pendingFormation = cmd.formation;
      s.formation = "normal";
      s.formationRemainingTicks = state.config.formationSwitchTicks;
    }
  } else {
    s.order =
      cmd.type === "ATTACK"
        ? { type: "ATTACK", targetSquadId: cmd.targetSquadId, seq: cmd.seq }
        : { type: cmd.type, destination: { ...cmd.destination }, seq: cmd.seq };
    s.currentTargetId = null;
    s.regroupRemainingTicks = 0;
    s.fsmState = "IDLE";
    // Explicit orders establish a new anchor. Attack-move advances it only while marching.
    s.anchor = { ...s.position };
  }
}

function move(
  s: Squad,
  destination: Squad["position"],
  state: BattleState,
): void {
  const before = s.position;
  s.position = moveTowards(
    before,
    destination,
    speedUnits(s, state.config, skillMultiplier(state, s, "speed")),
  );
  const dx = s.position.x - before.x,
    dy = s.position.y - before.y;
  if (dx !== 0 || dy !== 0) s.facing = { x: dx, y: dy };
}
function returnToAnchor(s: Squad, state: BattleState): void {
  s.currentTargetId = null;
  s.fsmState = "RETURN";
  move(s, s.anchor, state);
  if (distanceSquared(s.position, s.anchor) === 0n) s.fsmState = "IDLE";
}

/** Decisions read a single snapshot; movement is committed only after all units decide. */
export function advanceOrders(state: BattleState): void {
  const snapshot = structuredClone(state);
  for (const s of state.squads) {
    if (s.hpMilli === 0 || s.fsmState === "BROKEN") continue;
    if (s.fsmState === "ROUTED") {
      const zones = snapshot.safeZones
        .filter((z) => z.nationId === s.nationId)
        .sort((a, b) => {
          const d =
            distanceSquared(s.position, a.position) -
            distanceSquared(s.position, b.position);
          return d < 0n
            ? -1
            : d > 0n
              ? 1
              : a.position.x - b.position.x || a.position.y - b.position.y;
        });
      move(s, zones[0]?.position ?? s.anchor, state);
      continue;
    }
    if (s.fsmState === "REGROUP" && s.regroupRemainingTicks > 0) {
      s.regroupRemainingTicks--;
      if (s.regroupRemainingTicks === 0) s.fsmState = "IDLE";
      continue;
    }
    if (s.charge !== null) {
      advanceCharge(s, snapshot, state);
      continue;
    }
    const order = s.order;
    if (order?.type === "MOVE" || order?.type === "RETREAT") {
      s.fsmState = order.type;
      s.currentTargetId = null;
      move(s, order.destination, state);
      if (distanceSquared(s.position, order.destination) === 0n) {
        s.anchor = { ...s.position };
        s.order = null;
        s.fsmState = order.type === "RETREAT" ? "REGROUP" : "IDLE";
        s.regroupRemainingTicks =
          order.type === "RETREAT" ? state.config.status.regroupDelayTicks : 0;
      }
      continue; // Direct movement suppresses auto-engagement even on its arrival tick.
    }
    if (s.fsmState === "RETURN") {
      returnToAnchor(s, state);
      continue;
    }
    const radius = chaseRadius(s, state.config);
    const range = rangeUnits(s, state.config);
    const visible = state.config.visibility
      ? visibleSquadIds(snapshot, s.nationId)
      : null;
    const enemies = snapshot.squads.filter(
      (e) =>
        e.hpMilli > 0 &&
        e.nationId !== s.nationId &&
        (!visible || visible.has(e.id)),
    );
    const reachable = (e: Squad) =>
      within(s.position, e.position, range) ||
      (radius > 0 && within(s.anchor, e.position, radius));
    if (!within(s.anchor, s.position, radius)) {
      if (order?.type === "ATTACK") s.order = null;
      returnToAnchor(s, state);
      continue;
    }
    const explicit =
      order?.type === "ATTACK"
        ? enemies.find((e) => e.id === order.targetSquadId)
        : undefined;
    if (order?.type === "ATTACK" && (!explicit || !reachable(explicit))) {
      s.order = null;
      returnToAnchor(s, state);
      continue;
    }
    const current = enemies.find(
      (e) => e.id === s.currentTargetId && reachable(e),
    );
    const candidates = enemies.filter(reachable).sort((a, b) => {
      const threatA = a.currentTargetId === s.id ? 0 : 1,
        threatB = b.currentTargetId === s.id ? 0 : 1;
      const d =
        distanceSquared(s.position, a.position) -
        distanceSquared(s.position, b.position);
      return (
        threatA - threatB ||
        (d < 0n
          ? -1
          : d > 0n
            ? 1
            : (state.choicePolicy?.targetTies === "seeded"
                ? seededChoiceKey(state.seed, s.id, a.id) -
                  seededChoiceKey(state.seed, s.id, b.id)
                : 0) || compareIds(a.id, b.id))
      );
    });
    const target = explicit ?? current ?? candidates[0];
    // Lost an auto target: return completely before considering another chase.
    if (s.currentTargetId !== null && !current && !explicit) {
      returnToAnchor(s, state);
      continue;
    }
    if (target) {
      s.currentTargetId = target.id;
      if (within(s.position, target.position, range)) s.fsmState = "ENGAGE";
      else if (radius > 0) {
        s.fsmState = "CHASE";
        const proposed = moveTowards(
          s.position,
          target.position,
          speedUnits(s, state.config, skillMultiplier(state, s, "speed")),
        );
        if (within(s.anchor, proposed, radius)) move(s, proposed, state);
        else returnToAnchor(s, state);
      } else s.currentTargetId = null;
      continue;
    }
    s.currentTargetId = null;
    if (order?.type === "ATTACK_MOVE") {
      s.fsmState = "MOVE";
      move(s, order.destination, state);
      s.anchor = { ...s.position };
      if (distanceSquared(s.position, order.destination) === 0n) {
        s.order = null;
        s.fsmState = "IDLE";
      }
    } else if (distanceSquared(s.position, s.anchor) !== 0n)
      returnToAnchor(s, state);
    else s.fsmState = "IDLE";
  }
  // Determine attack eligibility using final positions; neither the old nor a mixed snapshot can hit.
  for (const s of state.squads) {
    if (forced(s) || (s.fsmState !== "CHASE" && s.fsmState !== "ENGAGE"))
      continue;
    const target = state.squads.find(
      (e) => e.id === s.currentTargetId && e.hpMilli > 0,
    );
    if (
      target &&
      (!state.config.visibility ||
        visibleSquadIds(state, s.nationId).has(target.id)) &&
      within(s.position, target.position, rangeUnits(s, state.config))
    )
      s.fsmState = "ENGAGE";
    else if (s.fsmState === "ENGAGE") s.fsmState = "IDLE";
  }
}
