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
/** Network projection only. Hidden entities, core RNG, and orders never enter it. Progression is projected only for allied players. */
export interface BattleView {
  tick: number;
  nationId: string;
  config: { tickMs: number; positionUnitsPerTile: number };
  visionRadiusUnits: number;
  squads: VisibleSquad[];
  commanders: VisibleCommander[];
  lastSeen: LastSighting[];
  nationalMatch?: {
    experimental: true;
    phase: number;
    deadline: number;
    unifyNation: string | null;
    unifyTicks: number;
    unifyRequired: number;
    players: {
      id: string;
      nationId: string;
      xp: number;
      merit: number;
      level: number;
      rank: string;
      supplyPoints: number;
      cap: { minMerit: number; squads: number; soldiers: number };
      nextXp: number | null;
      offer: { checkpoint: number; candidates: string[] } | null;
      selected: string[];
      job: {
        playerId: string;
        squadId: string | null;
        unitType: string;
        finishAt: number;
        soldiers: number;
        cost: number;
        pointId: string;
      } | null;
      feedback: string;
    }[];
    ranking: {
      playerId: string;
      nationId: string;
      human: boolean;
      merit: number;
      contribution: number;
      xp: number;
      level: number;
      rank: string;
      place: number;
    }[];
    rules: {
      refillSoldiers: number;
      costPerSoldier: number;
      recruitCost: number;
      recruitSoldiers: number;
      jobTicks: number;
      rMinLevel: number;
    };
  };
  objectiveMatch?: {
    experimental: true;
    tick: number;
    limitTicks: number;
    targetScore: number;
    captureTicks: number;
    radiusUnits: number;
    scoreEveryTicks: number;
    status: "running" | "finished";
    scores: Record<string, number>;
    points: {
      id: string;
      name: string;
      position: ViewPosition;
      owner: string | null;
      capturing: string | null;
      progressTicks: number;
      contested: boolean;
      open: boolean;
      opensAtTick: number;
      score: number;
    }[];
    result: {
      winner: string | null;
      reason: "score" | "time" | "abandoned" | "unification";
      tick: number;
      scores: Record<string, number>;
    } | null;
  };
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
