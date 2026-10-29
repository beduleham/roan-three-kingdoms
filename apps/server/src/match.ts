import rawConfig from "../../../battle_config.v1.json" with { type: "json" };
import {
  createBattle,
  step,
  parseBattleConfig,
} from "../../../packages/battle-core/dist/index.js";
import type {
  BattleInput,
  BattleState,
} from "../../../packages/battle-core/dist/index.js";
import { commandSchema } from "../../../packages/battle-core/dist/model.js";

const config = parseBattleConfig(rawConfig);
export type Seat = "blue" | "red";
export function initialOnlineBattle(): BattleState {
  return createBattle(config, 41, {
    players: ["blue", "red"].map((id) => ({ id, nationId: id, level: 16 })),
    squads: ["blue", "red"].flatMap((owner, side) =>
      (["spears", "archers"] as const).map((unitType, i) => ({
        id: `${owner}-${i + 1}`,
        ownerPlayerId: owner,
        nationId: owner,
        unitType,
        maxSoldiers: 20,
        hpMilli: 20 * config.soldierHp * config.hpMilliPerHp,
        position: {
          x: (side ? 14 : 6) * config.positionUnitsPerTile,
          y: (4 + i * 5) * config.positionUnitsPerTile,
        },
        facing: { x: side ? -1 : 1, y: 0 },
        stance: side ? ("balanced" as const) : ("defensive" as const),
      })),
    ),
    commanders: ["blue", "red"].map((owner, i) => ({
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
  });
}

/** Session ID is the sole seat authority. Untrusted payload never supplies identity, seq or tick. */
export class AuthoritativeMatch {
  state = initialOnlineBattle();
  private seats = new Map<string, Seat>();
  private connected = new Set<string>();
  private pending: BattleInput[] = [];
  private nextSeq = new Map<Seat, number>([
    ["blue", 0],
    ["red", 0],
  ]);
  join(sessionId: string): Seat | null {
    if (this.seats.has(sessionId)) {
      this.connected.add(sessionId);
      return this.seats.get(sessionId)!;
    }
    const seat = (["blue", "red"] as const).find(
      (s) => ![...this.seats.values()].includes(s),
    );
    if (seat) {
      this.seats.set(sessionId, seat);
      this.connected.add(sessionId);
    }
    return seat ?? null;
  }
  drop(sessionId: string) {
    this.connected.delete(sessionId);
    const seat = this.seats.get(sessionId);
    if (seat) this.pending = this.pending.filter((p) => p.playerId !== seat);
  }
  reconnect(sessionId: string) {
    if (!this.seats.has(sessionId)) return false;
    this.connected.add(sessionId);
    return true;
  }
  leave(sessionId: string) {
    this.drop(sessionId);
    this.seats.delete(sessionId);
  }
  get ready() {
    return this.seats.size === 2 && this.connected.size === 2;
  }
  seat(sessionId: string) {
    return this.seats.get(sessionId) ?? null;
  }
  submit(
    sessionId: string,
    payload: unknown,
  ): { accepted: boolean; reason?: string } {
    const seat = this.seats.get(sessionId);
    if (!seat || !this.connected.has(sessionId))
      return { accepted: false, reason: "NO_SEAT" };
    if (!this.ready) return { accepted: false, reason: "MATCH_PAUSED" };
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return { accepted: false, reason: "INVALID_FORMAT" };
    const input = commandSchema.safeParse({
      playerId: seat,
      command: {
        ...payload,
        seq: this.nextSeq.get(seat)!,
        requestedTick: this.state.tick,
      },
    });
    if (!input.success) return { accepted: false, reason: "INVALID_FORMAT" };
    const cmd = input.data.command;
    if (
      cmd.squadIds.some(
        (id) =>
          this.state.squads.find((s) => s.id === id)?.ownerPlayerId !== seat,
      ) ||
      ((cmd.type === "CAST_SKILL" || cmd.type === "REASSIGN_COMMANDER") &&
        this.state.commanders.find((c) => c.id === cmd.commanderId)
          ?.ownerPlayerId !== seat)
    )
      return { accepted: false, reason: "NOT_OWNER" };
    this.pending.push(input.data);
    this.nextSeq.set(seat, this.nextSeq.get(seat)! + 1);
    return { accepted: true };
  }
  advance() {
    if (!this.ready) return null;
    const commands = this.pending.splice(0);
    const result = step(this.state, commands);
    this.state = result.state;
    return result;
  }
}
