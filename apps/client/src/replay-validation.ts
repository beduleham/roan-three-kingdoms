import {
  createBattle,
  canonicalJson,
  replay,
} from "../../../packages/battle-core/src/index.js";
import type {
  BattleState,
  BattleInput,
} from "../../../packages/battle-core/src/index.js";
import { commandSchema } from "../../../packages/battle-core/src/model.js";
import { DEMO } from "./session.js";
import { replayPolicy } from "./replay-policy.js";
export type ReplayFailureCode =
  | "JSON"
  | "VERSION"
  | "SHAPE"
  | "LIMIT"
  | "INITIAL"
  | "INPUT"
  | "SIMULATION"
  | "TIMEOUT"
  | "WORKER"
  | "READ";
export type ReplayVerification =
  | { status: "invalid"; code: ReplayFailureCode; message: string }
  | {
      status: "match" | "mismatch";
      seed: number;
      tick: number;
      frames: number;
      commands: number;
      stateMatches: boolean;
      eventMatches: boolean;
      expectedStateHash: string;
      actualStateHash: string;
      expectedEventHash: string;
      actualEventHash: string;
    };
const invalid = (
  code: ReplayFailureCode,
  message: string,
): ReplayVerification => ({ status: "invalid", code, message });
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
/** Reconstruct a supported tick-zero demo snapshot; never apply imported state to a session. */
export function verifyReplayText(text: string): ReplayVerification {
  if (new TextEncoder().encode(text).byteLength > replayPolicy.maxBytes)
    return invalid("LIMIT", "파일이 10MiB 제한을 넘었습니다.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return invalid("JSON", "JSON을 읽을 수 없습니다.");
  }
  if (!record(data)) return invalid("SHAPE", "전투 로그 객체가 필요합니다.");
  if (data.version !== DEMO.version)
    return invalid("VERSION", "지원하지 않는 로그 버전입니다.");
  if (
    Object.keys(data).sort().join(",") !==
      "eventHash,frames,initial,stateHash,version" ||
    !record(data.initial) ||
    !Array.isArray(data.frames) ||
    typeof data.stateHash !== "string" ||
    !/^[0-9a-f]{16}$/.test(data.stateHash) ||
    typeof data.eventHash !== "string" ||
    !/^[0-9a-f]{16}$/.test(data.eventHash)
  )
    return invalid("SHAPE", "필수 기록 또는 해시 형식이 올바르지 않습니다.");
  if (data.frames.length > replayPolicy.maxFrames)
    return invalid("LIMIT", "검증 가능한 tick 수를 넘었습니다.");
  const raw = data.initial;
  if (
    raw.tick !== 0 ||
    !Array.isArray(raw.players) ||
    raw.players.length !== 2 ||
    !Array.isArray(raw.squads) ||
    raw.squads.length !== 4 ||
    !Array.isArray(raw.commanders) ||
    raw.commanders.length !== 2 ||
    !Array.isArray(raw.safeZones) ||
    raw.safeZones.length > 4 ||
    !Array.isArray(raw.augmentDefinitions) ||
    raw.augmentDefinitions.length > replayPolicy.maxDefinitions
  )
    return invalid("INITIAL", "지원하는 2대2 데모의 초기 기록이 아닙니다.");
  let initial: BattleState;
  try {
    const source = raw as unknown as BattleState;
    initial = createBattle(source.config, source.seed, {
      players: source.players,
      squads: source.squads,
      commanders: source.commanders,
      safeZones: source.safeZones,
      augmentDefinitions: source.augmentDefinitions,
    });
    if (canonicalJson(initial) !== canonicalJson(raw))
      return invalid("INITIAL", "초기 상태를 같은 형태로 복원할 수 없습니다.");
  } catch {
    return invalid("INITIAL", "초기 상태 또는 전투 설정이 올바르지 않습니다.");
  }
  const frames: BattleInput[][] = [];
  let commands = 0;
  for (const frame of data.frames) {
    if (!Array.isArray(frame))
      return invalid("INPUT", "tick별 입력 배열이 필요합니다.");
    if (
      frame.length > replayPolicy.maxCommandsPerFrame ||
      (commands += frame.length) > replayPolicy.maxCommands
    )
      return invalid("LIMIT", "검증 가능한 입력 수를 넘었습니다.");
    const parsed: BattleInput[] = [];
    for (const input of frame) {
      const result = commandSchema.safeParse(input);
      if (!result.success)
        return invalid("INPUT", "명령 형식이 올바르지 않습니다.");
      parsed.push(result.data);
    }
    frames.push(parsed);
  }
  try {
    const result = replay(initial, frames);
    const stateMatches = result.stateHash === data.stateHash,
      eventMatches = result.eventHash === data.eventHash;
    return {
      status: stateMatches && eventMatches ? "match" : "mismatch",
      seed: initial.seed,
      tick: result.state.tick,
      frames: frames.length,
      commands,
      stateMatches,
      eventMatches,
      expectedStateHash: data.stateHash,
      actualStateHash: result.stateHash,
      expectedEventHash: data.eventHash,
      actualEventHash: result.eventHash,
    };
  } catch {
    return invalid("SIMULATION", "현재 엔진으로 이 기록을 재현할 수 없습니다.");
  }
}
