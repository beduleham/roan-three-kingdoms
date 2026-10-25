/** 쌈국지 전투 엔진 타입 계약 초안 — 구현물이 아닌 참고용 */
export type PlayerId = string;
export type SquadId = string;
export type CommanderId = string;
export type NationId = string;
export type UnitType = 'infantry' | 'spears' | 'archers' | 'cavalry';
export type CommanderClass = 'warrior' | 'strategist' | 'commander';
export type Stance = 'defensive' | 'balanced' | 'aggressive';
export type Formation = 'normal' | 'defense' | 'offense';
export type SquadFSM =
  | 'IDLE' | 'MOVE' | 'ENGAGE' | 'CHASE' | 'RETURN'
  | 'RETREAT' | 'ROUTED' | 'BROKEN' | 'REGROUP' | 'RESUPPLY';

/** 1타일=1000 좌표 단위, 부동소수점 월드 좌표 사용 금지. */
export interface Vec2i { x: number; y: number }
export interface TimedEffect {
  id: string;
  sourceId: string;
  remainingTicks: number;
  stacks: number;
  magnitudeBp?: number;
}
export interface SquadOrder {
  type: 'MOVE' | 'ATTACK' | 'ATTACK_MOVE' | 'RETREAT' | 'HOLD';
  targetSquadId?: SquadId;
  targetPosition?: Vec2i;
}
export interface SquadState {
  id: SquadId;
  ownerPlayerId: PlayerId;
  nationId: NationId;
  unitType: UnitType;
  position: Vec2i;
  facingMilliRadians: number;
  anchor: Vec2i;
  hpMilli: number;
  maxSoldiers: number;
  morale: number; // int 0..100
  cohesion: number; // int 0..100
  veterancy: number; // int 0..100
  stance: Stance;
  formation: Formation;
  fsmState: SquadFSM;
  order: SquadOrder | null;
  currentTargetId: SquadId | null;
  effects: TimedEffect[];
  statusRemainingTicks: number;
  breakImmunityTicks: number;
}
export interface CommanderState {
  id: CommanderId;
  ownerPlayerId: PlayerId;
  classId: CommanderClass;
  assignedSquadId: SquadId | null;
  position: Vec2i;
  hpMilli: number;
  maxHpMilli: number;
  status: 'ACTIVE' | 'REASSIGNING' | 'EXPOSED' | 'WOUNDED';
  cooldownTicks: Record<'Q' | 'W' | 'R', number>;
  effects: TimedEffect[];
  respawnRemainingTicks: number;
}
export interface PlayerState {
  id: PlayerId;
  nationId: NationId;
  commanderId: CommanderId;
  controlledSquadIds: SquadId[];
  xp: number;
  level: number;
  rank: 'junior' | 'sima' | 'xiaowei' | 'zhonglangjiang' | 'general';
  merit: number;
  augments: string[];
  pendingAugmentChoices: number[];
  supplyPoints: number;
}
export interface BattleState {
  matchId: string;
  seed: number;
  tick: number;
  mode: 'training' | 'duel' | 'three_vs_three' | 'nation_match';
  phase: 'PREPARING' | 'RUNNING' | 'ENDED';
  players: PlayerState[];
  squads: SquadState[];
  commanders: CommanderState[];
}
export type BattleCommand =
  | { type: 'MOVE' | 'ATTACK_MOVE' | 'RETREAT'; seq: number; requestedTick: number; squadIds: SquadId[]; destination: Vec2i }
  | { type: 'ATTACK'; seq: number; requestedTick: number; squadIds: SquadId[]; targetSquadId: SquadId }
  | { type: 'SET_STANCE'; seq: number; requestedTick: number; squadIds: SquadId[]; stance: Stance }
  | { type: 'SET_FORMATION'; seq: number; requestedTick: number; squadIds: SquadId[]; formation: Formation }
  | { type: 'CAST_SKILL'; seq: number; requestedTick: number; commanderId: CommanderId; skill: 'Q' | 'W' | 'R'; targetSquadId?: SquadId; position?: Vec2i }
  | { type: 'REASSIGN_COMMANDER'; seq: number; requestedTick: number; commanderId: CommanderId; squadId: SquadId }
  | { type: 'SELECT_AUGMENT'; seq: number; requestedTick: number; augmentId: string };
export interface AuthenticatedCommand {
  /** 서버가 인증 연결에서 할당. 클라이언트 self-claim 무시 */
  playerId: PlayerId;
  command: BattleCommand;
}
export interface BattleEvent {
  tick: number;
  type: string;
  actorId: string;
  targetId?: string;
  sourceCommandSeq?: number;
  delta?: number;
  tags?: string[];
}
export interface StepResult { state: BattleState; events: BattleEvent[] }
/** 추후 실제 구현: 아래 시그니처를 만족하는 순수 함수로 작성. */
export type BattleStep = (state: Readonly<BattleState>, commands: readonly AuthenticatedCommand[]) => StepResult;
