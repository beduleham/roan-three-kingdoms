import { testResult } from "./test-result.js";
import type { TestResult } from "./test-result.js";
import {
  createBattle,
  step,
  hashReplayValue,
  canonicalJson,
} from "../../../packages/battle-core/src/index.js";
import type {
  BattleConfig,
  BattleState,
  BattleScenario,
  BattleInput,
  BattleEvent,
  Squad,
  Skill,
  Position,
} from "../../../packages/battle-core/src/index.js";
import { experimentalAugments } from "../../../packages/battle-core/src/data/experimental-v0.1.js";
export const HUMAN = "human";
export const DEMO = {
  version: "demo-order-v0.1",
  seed: 41,
  startLevel: 16,
  soldiers: 20,
} as const;
export type Unit = Squad["unitType"];
export interface Options {
  human: [Unit, Unit];
  enemy: [Unit, Unit];
  experimental: boolean;
}
export const defaults: Options = {
  human: ["cavalry", "spears"],
  enemy: ["infantry", "cavalry"],
  experimental: false,
};
type Command = BattleInput["command"];
export type Intent = Command extends infer C
  ? C extends Command
    ? Omit<C, "seq" | "requestedTick">
    : never
  : never;
export function scenario(
  config: BattleConfig,
  options: Options,
): BattleScenario {
  return {
    augmentDefinitions: options.experimental ? experimentalAugments : [],
    players: [
      { id: HUMAN, nationId: "blue", level: DEMO.startLevel },
      { id: "enemy", nationId: "red", level: DEMO.startLevel },
    ],
    squads: [HUMAN, "enemy"].flatMap((owner, i) =>
      options[i === 0 ? "human" : "enemy"].map((unitType, j) => ({
        id: `${owner}-${j + 1}`,
        ownerPlayerId: owner,
        nationId: i === 0 ? "blue" : "red",
        unitType,
        maxSoldiers: DEMO.soldiers,
        hpMilli: DEMO.soldiers * config.soldierHp * config.hpMilliPerHp,
        position: {
          x: (i === 0 ? 6 : 14) * config.positionUnitsPerTile,
          y: (4 + j * 5) * config.positionUnitsPerTile,
        },
        facing: { x: i === 0 ? 1 : -1, y: 0 },
        stance: i === 0 ? ("defensive" as const) : ("balanced" as const),
      })),
    ),
    commanders: [HUMAN, "enemy"].map((owner, i) => ({
      id: `${owner}-commander`,
      ownerPlayerId: owner,
      assignedSquadId: `${owner}-1`,
      hpMilli: config.commander.baseHp * config.hpMilliPerHp,
      maxHpMilli: config.commander.baseHp * config.hpMilliPerHp,
      respawnZoneIndex: i,
    })),
    safeZones: [
      { nationId: "blue", position: { x: 2000, y: 6500 }, radiusUnits: 1500 },
      { nationId: "red", position: { x: 22000, y: 6500 }, radiusUnits: 1500 },
    ],
  };
}
export class LocalSession {
  result: TestResult | null = null;
  state: BattleState;
  initial: BattleState;
  frames: BattleInput[][] = [];
  events: BattleEvent[] = [];
  selected: string[] = ["human-1"];
  inspectedEnemyId: string | null = null;
  pending: { skill: Skill; squadIds: string[]; targetSquadId?: string } | null =
    null;
  mode: "normal" | "ATTACK_MOVE" | "RETREAT" = "normal";
  paused = true;
  notice = "편성 확인 후 시작하세요.";
  private queue: BattleInput[] = [];
  private seq = 0;
  private accumulator = 0;
  private fingerprints = new Set<string>();
  constructor(
    readonly config: BattleConfig,
    public options: Options = structuredClone(defaults),
  ) {
    this.initial = createBattle(config, DEMO.seed, scenario(config, options));
    this.state = this.initial;
  }
  reset(options: Options = this.options) {
    this.options = structuredClone(options);
    this.initial = createBattle(
      this.config,
      DEMO.seed,
      scenario(this.config, options),
    );
    this.state = this.initial;
    this.result = null;
    this.frames = [];
    this.events = [];
    this.queue = [];
    this.seq = 0;
    this.accumulator = 0;
    this.fingerprints.clear();
    this.selected = ["human-1"];
    this.inspectedEnemyId = null;
    this.cancel();
    this.paused = true;
    this.notice = "초기화 완료 · 일시정지";
  }
  cancel() {
    this.pending = null;
    this.mode = "normal";
  }
  select(id: string, additive = false) {
    const s = this.state.squads.find((s) => s.id === id);
    if (!s || s.ownerPlayerId !== HUMAN) {
      this.notice = "자기 부대만 선택할 수 있습니다.";
      return false;
    }
    this.cancel();
    this.selected = additive
      ? this.selected.includes(id)
        ? this.selected.filter((x) => x !== id)
        : [...this.selected, id]
      : [id];
    return true;
  }
  // Observation only: never grants ownership, cancels targeting, or queues an input.
  inspectEnemy(id: string | null): boolean {
    if (id === null) {
      this.inspectedEnemyId = null;
      return true;
    }
    const squad = this.state.squads.find((s) => s.id === id);
    if (!squad || squad.ownerPlayerId === HUMAN) return false;
    this.inspectedEnemyId = id;
    return true;
  }
  beginSkill(skill: Skill) {
    this.cancel();
    if (this.result) {
      this.notice = "전멸 테스트 종료 · 다시 시작하세요.";
      return;
    }
    if (skill === "Q" && this.selected.length !== 1) {
      this.notice = "Q 실행 부대를 하나 선택하세요.";
      return;
    }
    this.pending = { skill, squadIds: skill === "Q" ? [...this.selected] : [] };
    this.notice =
      skill === "Q"
        ? "Q: 적 클릭 후 시전 확인 (Enter)"
        : "아군 대상 클릭 후 시전 확인 (Enter)";
  }
  target(id: string) {
    const p = this.pending,
      s = this.state.squads.find((s) => s.id === id);
    if (!p || !s) return;
    if (p.skill === "Q") {
      if (s.ownerPlayerId === HUMAN) {
        this.notice = "Q는 적 대상을 지정하세요.";
        return;
      }
      p.targetSquadId = id;
    } else {
      if (s.ownerPlayerId !== HUMAN) {
        this.notice = "아군 대상을 지정하세요.";
        return;
      }
      p.squadIds = p.squadIds.includes(id)
        ? p.squadIds.filter((x) => x !== id)
        : [...p.squadIds, id];
    }
  }
  confirmSkill() {
    const p = this.pending;
    if (!p) return;
    if (!p.squadIds.length || (p.skill === "Q" && !p.targetSquadId)) {
      this.notice = "대상을 먼저 지정하세요.";
      return;
    }
    this.send({ type: "CAST_SKILL", commanderId: "human-commander", ...p });
    this.cancel();
  }
  // Local trusted identity boundary. No playerId, seq or tick is taken from UI callers.
  send(intent: Intent): boolean {
    if (this.result) {
      this.notice = "전멸 테스트 종료 · 다시 시작하세요.";
      return false;
    }
    if (
      intent.type !== "SELECT_AUGMENT" &&
      (!intent.squadIds.length ||
        intent.squadIds.some(
          (id) =>
            this.state.squads.find((s) => s.id === id)?.ownerPlayerId !== HUMAN,
        ))
    ) {
      this.notice = "입력 거부: 자기 부대를 선택하세요.";
      return false;
    }
    if (
      (intent.type === "CAST_SKILL" || intent.type === "REASSIGN_COMMANDER") &&
      intent.commanderId !== "human-commander"
    ) {
      this.notice = "입력 거부: 장수 소유권";
      return false;
    }
    const normalized = {
      ...structuredClone(intent),
      squadIds: [...intent.squadIds].sort(),
    };
    const key = canonicalJson(normalized);
    if (this.fingerprints.has(key)) {
      this.notice = "같은 tick의 중복 입력을 무시했습니다.";
      return false;
    }
    this.fingerprints.add(key);
    this.queue.push({
      playerId: HUMAN,
      command: {
        ...normalized,
        seq: this.seq++,
        requestedTick: this.state.tick,
      },
    });
    this.notice = "명령 대기 · 다음 tick에 코어 검증";
    return true;
  }
  rightClick(position: Position, targetId?: string) {
    if (this.pending) {
      this.cancel();
      this.notice = "스킬 지정 취소 · 이동은 다시 우클릭";
      return;
    }
    const ids = [...this.selected];
    if (this.mode !== "normal")
      this.send({ type: this.mode, squadIds: ids, destination: position });
    else if (
      targetId &&
      this.state.squads.find((s) => s.id === targetId)?.ownerPlayerId !== HUMAN
    )
      this.send({ type: "ATTACK", squadIds: ids, targetSquadId: targetId });
    else this.send({ type: "MOVE", squadIds: ids, destination: position });
    this.mode = "normal";
  }
  get canStartEngagement(): boolean {
    return (
      !this.result &&
      this.paused &&
      this.state.tick === 0 &&
      !this.pending &&
      this.mode === "normal" &&
      this.queue.length === 0 &&
      this.state.squads.some(
        (s) => s.ownerPlayerId === HUMAN && s.hpMilli > 0,
      ) &&
      this.initial.squads.some(
        (s) => s.ownerPlayerId !== HUMAN && s.hpMilli > 0,
      )
    );
  }
  // Explicit one-time player order shortcut, not an autonomous AI decision.
  startEngagement(): boolean {
    if (!this.canStartEngagement) return false;
    const ids = this.state.squads
      .filter((s) => s.ownerPlayerId === HUMAN && s.hpMilli > 0)
      .map((s) => s.id)
      .sort();
    const enemies = this.initial.squads.filter(
      (s) => s.ownerPlayerId !== HUMAN && s.hpMilli > 0,
    );
    const destination = {
      x: Math.round(
        enemies.reduce((sum, s) => sum + s.position.x, 0) / enemies.length,
      ),
      y: Math.round(
        enemies.reduce((sum, s) => sum + s.position.y, 0) / enemies.length,
      ),
    };
    const accepted =
      this.send({ type: "SET_STANCE", squadIds: ids, stance: "aggressive" }) &&
      this.send({ type: "ATTACK_MOVE", squadIds: ids, destination });
    if (!accepted) return false;
    this.selected = ids;
    this.togglePause();
    this.notice = "아군 전체 전진 명령 · Q/W/R은 직접 사용하세요.";
    return true;
  }
  togglePause() {
    if (this.result) {
      this.notice = "전멸 테스트 종료 · 다시 시작하세요.";
      return;
    }
    this.paused = !this.paused;
    this.accumulator = 0;
  }
  advance(deltaMs: number) {
    if (this.result || this.paused || !Number.isFinite(deltaMs) || deltaMs < 0)
      return;
    // Process a bounded number per render frame, retaining debt instead of changing tick duration.
    this.accumulator += deltaMs;
    let count = 0;
    while (this.accumulator >= this.config.tickMs && count++ < 10) {
      this.accumulator -= this.config.tickMs;
      const commands = this.queue;
      this.queue = [];
      this.fingerprints.clear();
      const result = step(this.state, commands);
      this.state = result.state;
      this.frames.push(commands);
      this.events.push(...result.events);
      const rejected = [...result.events]
        .reverse()
        .find((e) => e.type === "COMMAND_REJECTED");
      if (rejected) this.notice = `코어 거부: ${rejected.reason}`;
      else if (commands.length)
        this.notice = "명령 처리 완료 · 결과는 HUD와 사건 로그에서 확인";
      this.result = testResult(this.initial, this.state, this.events);
      if (this.result) {
        this.paused = true;
        this.accumulator = 0;
        this.queue = [];
        this.fingerprints.clear();
        this.cancel();
        this.notice = "전멸 테스트 종료 · 결과를 확인하고 다시 시작하세요.";
        break;
      }
    }
  }
  exportLog() {
    return {
      version: DEMO.version,
      initial: this.initial,
      frames: this.frames,
      stateHash: hashReplayValue(this.state),
      eventHash: hashReplayValue(this.events),
    };
  }
}
