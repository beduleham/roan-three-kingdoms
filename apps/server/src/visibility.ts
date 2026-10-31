import rawSettings from "../../../fog_config.v1.json" with { type: "json" };
import {
  livingSoldiers,
  visibleSquadIds,
} from "../../../packages/battle-core/dist/index.js";
import type {
  BattleState,
  BattleEvent,
} from "../../../packages/battle-core/dist/index.js";
import type {
  BattleView,
  LastSighting,
  VisibleBattleEvent,
} from "@roan/protocol";

if (
  !Number.isSafeInteger(rawSettings.radiusTiles) ||
  rawSettings.radiusTiles <= 0 ||
  rawSettings.sharing !== "nation" ||
  rawSettings.memory !== "last-position-and-observed-tick"
)
  throw new Error("Invalid fog_config.v1.json");

export class NationVisibility {
  private memory = new Map<string, Map<string, LastSighting>>();
  constructor(readonly radiusTiles = rawSettings.radiusTiles) {
    if (!Number.isSafeInteger(radiusTiles) || radiusTiles <= 0)
      throw new Error("Invalid vision radius");
  }
  visibleIds(state: BattleState, nationId: string): Set<string> {
    return visibleSquadIds(state, nationId, this.radiusTiles);
  }
  observe(state: BattleState) {
    for (const nation of new Set(state.players.map((p) => p.nationId))) {
      const seen = this.visibleIds(state, nation);
      const memory = this.memory.get(nation) ?? new Map<string, LastSighting>();
      for (const squad of state.squads) {
        if (squad.nationId === nation || !seen.has(squad.id)) continue;
        if (squad.hpMilli <= 0) memory.delete(squad.id);
        else
          memory.set(squad.id, {
            id: squad.id,
            position: { ...squad.position },
            observedTick: state.tick,
          });
      }
      this.memory.set(nation, memory);
    }
  }
  view(state: BattleState, nationId: string): BattleView {
    const visible = this.visibleIds(state, nationId);
    const allies = new Set(
      state.players.filter((p) => p.nationId === nationId).map((p) => p.id),
    );
    return {
      tick: state.tick,
      nationId,
      config: {
        tickMs: state.config.tickMs,
        positionUnitsPerTile: state.config.positionUnitsPerTile,
      },
      visionRadiusUnits: this.radiusTiles * state.config.positionUnitsPerTile,
      squads: state.squads
        .filter((s) => visible.has(s.id))
        .map((s) => ({
          id: s.id,
          ownerPlayerId: s.ownerPlayerId,
          nationId: s.nationId,
          unitType: s.unitType,
          position: { ...s.position },
          facing: { ...s.facing },
          hpMilli: s.hpMilli,
          maxSoldiers: s.maxSoldiers,
          soldiers: livingSoldiers(s, state.config),
          morale: s.morale,
          cohesion: s.cohesion,
          stance: s.stance,
          formation: s.formation,
          fsmState: s.fsmState,
        })),
      commanders: state.commanders
        .filter((c) => allies.has(c.ownerPlayerId))
        .map((c) => ({
          id: c.id,
          ownerPlayerId: c.ownerPlayerId,
          assignedSquadId: c.assignedSquadId,
          hpMilli: c.hpMilli,
          status: c.status,
          cooldownTicks: { ...c.cooldownTicks },
        })),
      lastSeen: [...(this.memory.get(nationId)?.values() ?? [])]
        .filter((entry) => !visible.has(entry.id))
        .map((entry) => structuredClone(entry)),
    };
  }
  /** Drop events with any hidden entity reference and serialize only display fields. */
  events(
    state: BattleState,
    nationId: string,
    events: readonly BattleEvent[],
  ): VisibleBattleEvent[] {
    const ids = this.visibleIds(state, nationId);
    const allies = state.players
      .filter((p) => p.nationId === nationId)
      .map((p) => p.id);
    allies.forEach((id) => ids.add(id));
    state.commanders
      .filter((c) => allies.includes(c.ownerPlayerId))
      .forEach((c) => ids.add(c.id));
    return events
      .filter((event) =>
        [
          event.actorId,
          event.targetId,
          event.sourceCommanderId,
          ...(event.targetSquadIds ?? []),
        ].every((id) => id === undefined || ids.has(id)),
      )
      .map((event) => ({
        tick: event.tick,
        type: event.type,
        actorId: event.actorId,
        ...(event.targetId === undefined ? {} : { targetId: event.targetId }),
        ...(event.delta === undefined ? {} : { delta: event.delta }),
        ...(event.reason === undefined ? {} : { reason: event.reason }),
        ...(event.skill === undefined ? {} : { skill: event.skill }),
      }));
  }
}
export const defaultVisionRadiusTiles = rawSettings.radiusTiles;
