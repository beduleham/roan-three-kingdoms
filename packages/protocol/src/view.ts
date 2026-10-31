export interface ViewPosition {
  x: number;
  y: number;
}
export interface VisibleSquad {
  id: string;
  ownerPlayerId: string;
  nationId: string;
  unitType: string;
  position: ViewPosition;
  facing: ViewPosition;
  hpMilli: number;
  maxSoldiers: number;
  soldiers: number;
  morale: number;
  cohesion: number;
  stance: string;
  formation: string;
  fsmState: string;
}
export interface LastSighting {
  id: string;
  position: ViewPosition;
  observedTick: number;
}
export interface VisibleCommander {
  id: string;
  ownerPlayerId: string;
  assignedSquadId: string | null;
  hpMilli: number;
  status: string;
  cooldownTicks: { Q: number; W: number; R: number };
}
/** Network projection only. Hidden entities, core RNG, orders and private progression never enter it. */
export interface BattleView {
  tick: number;
  nationId: string;
  config: { tickMs: number; positionUnitsPerTile: number };
  visionRadiusUnits: number;
  squads: VisibleSquad[];
  commanders: VisibleCommander[];
  lastSeen: LastSighting[];
}
export interface VisibleBattleEvent {
  tick: number;
  type: string;
  actorId: string;
  targetId?: string;
  delta?: number;
  reason?: string;
  skill?: string;
}
